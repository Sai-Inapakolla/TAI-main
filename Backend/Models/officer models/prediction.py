import pandas as pd
import numpy as np
import joblib

# --- Constants and Rule-Based Functions (from notebook) ---
BANK_RULES = {
    0: {"name": "HDFC", "min_cibil": 750, "min_salary": 25000, "min_exp": 2, "max_dti": 0.45},
    1: {"name": "SBI", "min_cibil": 750, "min_salary": 15000, "min_exp": 1, "max_dti": 0.50},
    2: {"name": "ICICI", "min_cibil": 700, "min_salary": 30000, "min_exp": 2, "max_dti": 0.45},
    3: {"name": "Axis", "min_cibil": 710, "min_salary": 15000, "min_exp": 1, "max_dti": 0.45},
    4: {"name": "Kotak", "min_cibil": 700, "min_salary": 20000, "min_exp": 2, "max_dti": 0.45},
    5: {"name": "IndusInd", "min_cibil": 730, "min_salary": 25000, "min_exp": 2, "max_dti": 0.40},
    6: {"name": "IDFC FIRST", "min_cibil": 700, "min_salary": 20000, "min_exp": 1, "max_dti": 0.50},
    7: {"name": "YES", "min_cibil": 700, "min_salary": 18000, "min_exp": 1, "max_dti": 0.50},
    8: {"name": "Bank of India", "min_cibil": 710, "min_salary": 16000, "min_exp": 1, "max_dti": 0.50},
    9: {"name": "Bank of Baroda", "min_cibil": 705, "min_salary": 25000, "min_exp": 2, "max_dti": 0.45}
}

def officer_approval(row):
    bank = row["Approved_Bank"]

    # If user never selected a bank (rejected at user level)
    if bank == -1:
        return 0

    rule = BANK_RULES[bank]

    dti = row["Existing_EMI"] / max(row["ApplicantIncome"], 1)

    if (
        row["Hidden_CIBIL"] >= rule["min_cibil"] and
        row["ApplicantIncome"] >= rule["min_salary"] and
        row["Work_Experience_Years"] >= rule["min_exp"] and
        dti <= rule["max_dti"] and
        row["LoanAmount"] <= row["ApplicantIncome"] * 40
    ):
        return 1
    else:
        return 0

def fraud_label(row):
    dti = row["Existing_EMI"] / max(row["ApplicantIncome"], 1)

    if (
        (row["Salary_Payment_Mode"] == 0 and row["LoanAmount"] > 500000) or
        (row["Hidden_CIBIL"] < 600) or
        (dti > 0.6) or
        (row["Work_Experience_Years"] < 1 and row["LoanAmount"] > 300000) or
        (row["ApplicantIncome"] < 20000 and row["LoanAmount"] > 600000)
    ):
        return 1
    else:
        return 0

def eligible_loan_amount(row):
    cibil = row["Hidden_CIBIL"]

    if cibil >= 750:
        multiplier = 35
    elif cibil >= 700:
        multiplier = 30
    elif cibil >= 650:
        multiplier = 25
    else:
        multiplier = 20

    base_amount = row["ApplicantIncome"] * multiplier
    emi_penalty = row["Existing_EMI"] * row["Loan_Amount_Term"]

    eligible = base_amount - emi_penalty

    # Bank cannot approve more than requested
    return max(0, min(eligible, row["LoanAmount"]))

# --- Load Models and Features ---
# --- Load Models and Features ---
import os
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

try:
    officer_approval_model = joblib.load(os.path.join(BASE_DIR, "officer_approval_model.pkl"))
    officer_approval_features = joblib.load(os.path.join(BASE_DIR, "officer_approval_features.pkl"))

    fraud_detection_model = joblib.load(os.path.join(BASE_DIR, "fraud_detection_model.pkl"))
    fraud_features = joblib.load(os.path.join(BASE_DIR, "fraud_features.pkl"))

    loan_amount_model = joblib.load(os.path.join(BASE_DIR, "loan_amount_model.pkl"))
    loan_amount_features = joblib.load(os.path.join(BASE_DIR, "loan_amount_features.pkl"))
    print("All officer models and feature lists loaded successfully.")
except FileNotFoundError as e:
    print(f"Error loading model or feature file: {e}. Make sure all .pkl files are in the same directory.")
    # Exit or handle error appropriately in a real application
    exit()

def officer_predict(data: dict) -> dict:
    """
    Predicts officer approval, fraud risk, and eligible loan amount for a single loan application.
    """
    
    # 1. Map Frontend Keys to Model Feature Names
    input_dict = {
        'Age': data.get('age', 30),
        'Gender': data.get('gender', 'Male'),
        'Marital_Status': data.get('maritalStatus', 'Single'),
        'Dependents': data.get('dependents', '0'),
        'Education': data.get('education', 'Graduate'),
        'Self_Employed': data.get('selfEmployed', 'No'),
        'Work_Experience_Years': data.get('experience', 0),
        'ApplicantIncome': data.get('applicantIncome', 0),
        'CoapplicantIncome': data.get('coApplicantIncome', 0),
        'Salary_Payment_Mode': data.get('salaryMode', 'Cash'),
        'Existing_EMI': data.get('existingEmi', 0),
        'Residential_Assets': data.get('assets', 'None'),
        'Area': data.get('area', 'Urban'),
        'Loan_Purpose': data.get('loanPurpose', 'Other'),
        'LoanAmount': data.get('loanAmount', 0),
        'Loan_Amount_Term': data.get('tenure', 12),
        'Hidden_CIBIL': data.get('Hidden_CIBIL', 700),
        'Approved_Bank': data.get('Approved_Bank', 0)
    }

    # If keys are already in Title Case (passed from rawApplication.input directly with some overrides)
    # We should merge the raw data with our mapped defaults if the raw inputs use original keys (Age, Gender...)
    # But frontend sends 'applicant' object constructed from 'input' in loadApplication.
    # Actually, in runPrediction():
    # modelInput = { ...this.rawApplication.input, "Hidden_CIBIL": ..., "Approved_Bank": ... }
    # rawApplication.input has Title Case keys (Age, Gender...) as saved in app.py predict() 'input': data
    # WAIT! user-eligibility uses camelCase for sending to backend.
    # app.py predict() receives user-eligibility data (camelCase).
    # Then it saves: 'input': data. So 'input' has camelCase keys!
    # Let's verify 'local_applications.json' again.
    
    # 2. Encoding
    df = pd.DataFrame([input_dict])
    
    # If the input data actually had Title Case keys (e.g. from Python test script), use them.
    # Check if 'Age' is in data, if so override.
    if 'Age' in data: df['Age'] = data['Age']
    if 'ApplicantIncome' in data: df['ApplicantIncome'] = data['ApplicantIncome']
    if 'LoanAmount' in data: df['LoanAmount'] = data['LoanAmount']
    if 'Existing_EMI' in data: df['Existing_EMI'] = data['Existing_EMI']
    if 'Work_Experience_Years' in data: df['Work_Experience_Years'] = data['Work_Experience_Years']
    
    mappings = {
        'Gender': {'Female': 0, 'Male': 1, 'Other': 2},
        'Marital_Status': {'Single': 0, 'Married': 1},
        'Education': {'Graduate': 0, 'Not Graduate': 1},
        'Self_Employed': {'No': 0, 'Yes': 1},
        'Area': {'Rural': 0, 'Semiurban': 1, 'Urban': 2},
        'Salary_Payment_Mode': {'Bank Transfer': 0, 'Cash': 1, 'Cheque': 2},
        'Residential_Assets': {'House + Land': 0, 'None': 1, 'Own House': 2},
        'Loan_Purpose': {
            'Asset Purchase': 0, 'Education': 1, 'Home Renovation': 2, 
            'Medical': 3, 'Other': 4, 'Wedding': 5
        },
        'Dependents': {'0': 0, '1': 1, '2': 2, '3+': 3}
    }
    
    # Apply mappings
    for col, mapping in mappings.items():
        if col in df.columns:
            val = df.iloc[0][col]
            if isinstance(val, str):
                val = val.strip()
            encoded_val = mapping.get(str(val), 0)
            df[col] = encoded_val

    # Convert numeric columns explicitly
    numeric_cols = ['Age', 'Work_Experience_Years', 'ApplicantIncome', 'CoapplicantIncome', 
                    'Existing_EMI', 'LoanAmount', 'Loan_Amount_Term', 'Hidden_CIBIL', 'Approved_Bank']
    for col in numeric_cols:
        if col in df.columns:
             df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)

    results = {}

    # --- Rule-Based Predictions ---
    try:
        results['Officer_Approved_Rule'] = int(officer_approval(df.iloc[0]))
        results['Fraud_Label_Rule'] = int(fraud_label(df.iloc[0]))
        results['Eligible_Loan_Amount_Rule'] = float(eligible_loan_amount(df.iloc[0]))
    except Exception as e:
        print(f"Rule Logic Error: {e}")
        results['Officer_Approved_Rule'] = 0
        results['Fraud_Label_Rule'] = 0
        results['Eligible_Loan_Amount_Rule'] = 0.0

    # --- ML Model Predictions ---
    try:
        # Prepare features for officer approval model
        # Ensure columns exist
        for feat in officer_approval_features:
            if feat not in df.columns: df[feat] = 0
        
        features_for_officer = df[officer_approval_features]
        results['Officer_Approved_Model'] = int(officer_approval_model.predict(features_for_officer)[0])

        # Prepare features for fraud detection model
        for feat in fraud_features:
            if feat not in df.columns: df[feat] = 0
            
        features_for_fraud = df[fraud_features]
        results['Fraud_Label_Model'] = int(fraud_detection_model.predict(features_for_fraud)[0])

        # Prepare features for loan amount model
        for feat in loan_amount_features:
            if feat not in df.columns: df[feat] = 0
            
        features_for_loan_amount = df[loan_amount_features]
        results['Eligible_Loan_Amount_Model'] = float(loan_amount_model.predict(features_for_loan_amount)[0])
        
    except Exception as e:
        print(f"Model Inference Error: {e}")
        results['Officer_Approved_Model'] = 0
        results['Fraud_Label_Model'] = 0
        results['Eligible_Loan_Amount_Model'] = 0.0

    return results

if __name__ == '__main__':
    # Example usage:
    # This example data is taken from the first row of the 'officer_df' in the notebook
    sample_application = {
        "Age": 53, "Gender": 1, "Marital_Status": 0, "Dependents": 3,
        "Education": 1, "Self_Employed": 1, "Work_Experience_Years": 31,
        "ApplicantIncome": 70723, "CoapplicantIncome": 0,
        "Salary_Payment_Mode": 0, "Existing_EMI": 627,
        "Residential_Assets": 1, "Area": 0, "Loan_Purpose": 1,
        "LoanAmount": 2175403, "Loan_Amount_Term": 18,
        "Hidden_CIBIL": 758.06, "Approved_Bank": 0
    }

    print("Running prediction for sample application:")
    predictions = officer_predict(sample_application)
    for key, value in predictions.items():
        print(f"- {key}: {value}")

    # Another example with different data
    sample_application_2 = {
        "Age": 30, "Gender": 0, "Marital_Status": 1, "Dependents": 0,
        "Education": 2, "Self_Employed": 0, "Work_Experience_Years": 5,
        "ApplicantIncome": 40000, "CoapplicantIncome": 5000,
        "Salary_Payment_Mode": 1, "Existing_EMI": 1000,
        "Residential_Assets": 0, "Area": 1, "Loan_Purpose": 2,
        "LoanAmount": 500000, "Loan_Amount_Term": 60,
        "Hidden_CIBIL": 720.00, "Approved_Bank": 2 # ICICI bank
    }
    print("\nRunning prediction for second sample application:")
    predictions_2 = officer_predict(sample_application_2)
    for key, value in predictions_2.items():
        print(f"- {key}: {value}")
