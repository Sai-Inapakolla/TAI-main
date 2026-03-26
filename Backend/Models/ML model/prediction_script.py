
import pandas as pd
import numpy as np

def predict(data, approval_model, bank_model, bank_encoder, features_list):
    """
    Predicts loan approval and recommends a bank.
    
    Args:
        data (dict): Dictionary of input features from frontend.
        approval_model: Loaded XGBClassifier for approval.
        bank_model: Loaded model for bank recommendation.
        bank_encoder: LabelEncoder for bank names.
        features_list (list): Order of features expected by the model.
        
    Returns:
        dict: {
            'status': 'Approved' or 'Rejected',
            'probability': float (0-100),
            'bank': str (Bank Name or None),
            'approved': bool
        }
    """
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
        'Loan_Amount_Term': data.get('tenure', 12)
    }
    
    df = pd.DataFrame([input_dict])
    
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
    for col, mapping in mappings.items():
        if col in df.columns:
            val = df.iloc[0][col]
            if isinstance(val, str):
                val = val.strip()
            encoded_val = mapping.get(str(val), 0) 
            df[col] = encoded_val
    final_df = pd.DataFrame()
    for feature in features_list:
        if feature in df.columns:
            final_df[feature] = df[feature]
        else:
            final_df[feature] = 0
    final_df = final_df.apply(pd.to_numeric, errors='coerce').fillna(0)
    HARDCODED_BANKS = [
        'Axis Bank',
        'Bank of Baroda',
        'Bank of India',
        'HDFC Bank',
        'ICICI Bank',
        'IDFC FIRST Bank',
        'IndusInd Bank',
        'Kotak Mahindra Bank',
        'State Bank of India (SBI)',
        'YES Bank'
    ]
    try:
        probs = approval_model.predict_proba(final_df)[0]
        approval_prob = probs[1]
        is_approved = approval_prob > 0.5
        
        result = {
            'approved': bool(is_approved),
            'status': 'Approved' if is_approved else 'Rejected',
            'probability': float(round(approval_prob * 100, 2)),
            'bank': 'N/A'
        }
        result['bank_list'] = []
        if is_approved:
            display_banks = []
            def get_bank_name(idx):
                if bank_encoder:
                    try:
                        name = bank_encoder.inverse_transform([idx])[0]
                        if str(name).isdigit() and 0 <= int(name) < len(HARDCODED_BANKS):
                            return HARDCODED_BANKS[int(name)]
                        return str(name)
                    except:
                        pass
                if 0 <= idx < len(HARDCODED_BANKS):
                    return HARDCODED_BANKS[idx]
                return f"Bank {idx}"
            if hasattr(bank_model, 'predict_proba'):
                try:
                    bank_probs = bank_model.predict_proba(final_df)[0]
                    top_indices = bank_probs.argsort()[-5:][::-1]
                    max_prob = float(bank_probs.max())
                    
                    for idx in top_indices:
                        bank_name = get_bank_name(idx)
                        raw_prob = float(bank_probs[idx])
                        prob = (raw_prob / max_prob) * 94.5 if max_prob > 0 else 0.0
                        prob = min(prob + 2.0, 99.9)
                        approval_score = float(approval_prob * 100)
                        risk_score = approval_score - ((100.0 - prob) * 0.15) 
                        
                        risk = "Low"
                        if risk_score < 75: risk = "Medium"
                        if risk_score < 50: risk = "High"
                        
                        display_banks.append({
                            'name': bank_name,
                            'probability': float(round(prob, 1)),
                            'risk': risk
                        })
                except Exception as b_err:
                    print(f"Bank probability error: {b_err}")
            if not display_banks:
                bank_idx = int(bank_model.predict(final_df)[0])
                bank_name = get_bank_name(bank_idx)
                
                result['bank'] = bank_name
                display_banks.append({
                    'name': bank_name, 
                    'probability': 90.0, 
                    'risk': 'Low'
                })
            else:
                result['bank'] = display_banks[0]['name']
                
            result['bank_list'] = display_banks
                
        return result

    except Exception as e:
        print(f"Prediction Error: {e}")
        return {
            'approved': False,
            'status': 'Error',
            'probability': 0,
            'bank': None,
            'error': str(e)
        }
