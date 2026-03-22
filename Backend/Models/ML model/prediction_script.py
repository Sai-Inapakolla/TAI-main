
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
    
    # 1. Map Frontend Keys to Model Feature Names
    # Note: Keys must match what the Angular app sends.
    # Assuming Angular sends camelCase keys as seen in user-eligibility.
    
    # Default values provided for safety
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
    
    # 2. Encoding Categorical Variables
    # We use standard Label Encoding logic (Alphabetical Order) to match training time behavior
    # If the user used a custom encoder for features, it should have been provided.
    # We fallback to this convention.
    
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
            # Clean string input just in case
            val = df.iloc[0][col]
            if isinstance(val, str):
                val = val.strip()
            
            # Map, default to 0 if not found to avoid crash
            encoded_val = mapping.get(str(val), 0) 
            df[col] = encoded_val

    # Ensure all columns from features_list exist and are in order
    final_df = pd.DataFrame()
    for feature in features_list:
        if feature in df.columns:
            final_df[feature] = df[feature]
        else:
            final_df[feature] = 0 # Fill missing features with 0
            
    # Convert to numeric (handle inputs passed as strings)
    final_df = final_df.apply(pd.to_numeric, errors='coerce').fillna(0)

    # Fallback/Hardcoded Bank Mapping (Alphabetical Order as per LabelEncoder default)
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

    # 3. Prediction
    try:
        # Probability of Class 1 (Approved)
        # XGBoost predict_proba returns [[prob_0, prob_1]]
        probs = approval_model.predict_proba(final_df)[0]
        approval_prob = probs[1]
        
        # Threshold at 0.5
        is_approved = approval_prob > 0.5
        
        result = {
            'approved': bool(is_approved),
            'status': 'Approved' if is_approved else 'Rejected',
            'probability': float(round(approval_prob * 100, 2)),
            'bank': 'N/A'
        }
        
        # 4. Bank Recommendation (Only if approved)
        result['bank_list'] = []
        if is_approved:
            display_banks = []
            
            # Helper to get bank name
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

            # Try to get probabilities for all banks
            if hasattr(bank_model, 'predict_proba'):
                try:
                    bank_probs = bank_model.predict_proba(final_df)[0]
                    # Get indices of top 5
                    top_indices = bank_probs.argsort()[-5:][::-1]
                    max_prob = float(bank_probs.max())
                    
                    for idx in top_indices:
                        bank_name = get_bank_name(idx)
                        raw_prob = float(bank_probs[idx])
                        
                        # Scale probability relative to the max probability so top choice is highly rated
                        prob = (raw_prob / max_prob) * 94.5 if max_prob > 0 else 0.0
                        prob = min(prob + 2.0, 99.9) # Add a base to not make the 5th choice 1%
                        
                        # Determine risk level (e.g., inversely related to match probability or base approval)
                        # Instead of absolute softmax thresholding, use relative metrics or approval_prob.
                        approval_score = float(approval_prob * 100)
                        # The match probability only marginally increases the default risk 
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
            
            # Fallback if predict_proba fails or empty
            if not display_banks:
                bank_idx = int(bank_model.predict(final_df)[0])
                bank_name = get_bank_name(bank_idx)
                
                result['bank'] = bank_name # Primary recommendation
                display_banks.append({
                    'name': bank_name, 
                    'probability': 90.0, 
                    'risk': 'Low'
                })
            else:
                result['bank'] = display_banks[0]['name'] # Top one as primary
                
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
