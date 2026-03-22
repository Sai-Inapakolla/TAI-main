import pandas as pd
import numpy as np
import pickle
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier
from sklearn.preprocessing import LabelEncoder
import os

print("Starting training process...")

# 1. Load Dataset
csv_file = "balanced_user_level_dataset_40k.csv"
if not os.path.exists(csv_file):
    print(f"Error: {csv_file} not found!")
    exit(1)

df = pd.read_csv(csv_file)
print(f"Dataset loaded: {df.shape[0]} rows.")

# 2. Define Features and Targets
features_list = ['Age', 'Gender', 'Marital_Status', 'Dependents', 'Education', 'Self_Employed', 
                 'Work_Experience_Years', 'ApplicantIncome', 'CoapplicantIncome', 'Salary_Payment_Mode', 
                 'Existing_EMI', 'Residential_Assets', 'Area', 'Loan_Purpose', 'LoanAmount', 'Loan_Amount_Term']

target_approval = 'Approved_Status'
target_bank = 'Approved_Bank'

# 3. Clean and Map Variables exactly as expected by prediction_script.py
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

print("Encoding categorical features...")
for col, mapping in mappings.items():
    if col in df.columns:
        df[col] = df[col].astype(str).str.strip().map(mapping).fillna(0)

# Fill missing numeric values with 0
df[features_list] = df[features_list].apply(pd.to_numeric, errors='coerce').fillna(0)

X = df[features_list]

# Encode Approval Target (Assuming 'Approved' and 'Rejected')
if df[target_approval].dtype == 'object':
    df['Approval_Label'] = df[target_approval].apply(lambda x: 1 if str(x).lower().strip() == 'approved' else 0)
else:
    df['Approval_Label'] = df[target_approval].fillna(0).astype(int)

y_approval = df['Approval_Label']

# 4. Train Approval Model (XGBClassifier)
print("Training Approval Model...")
X_train_app, X_test_app, y_train_app, y_test_app = train_test_split(X, y_approval, test_size=0.2, random_state=42)
approval_model = XGBClassifier(n_estimators=100, max_depth=6, random_state=42, use_label_encoder=False, eval_metric='logloss')
approval_model.fit(X_train_app, y_train_app)
print(f"Approval Model Train Accuracy: {approval_model.score(X_train_app, y_train_app):.4f}")
print(f"Approval Model Test Accuracy:  {approval_model.score(X_test_app, y_test_app):.4f}")

# 5. Train Bank Recommendation Model
print("Training Bank Recommendation Model...")
# Filter to only Approved loans for bank recommendation
df_approved = df[df['Approval_Label'] == 1].copy()

# Filter out rows where Approved_Bank is empty/null/none
df_approved = df_approved[df_approved[target_bank].notna()]
df_approved = df_approved[df_approved[target_bank].astype(str).str.strip() != '']
df_approved = df_approved[df_approved[target_bank].astype(str).str.lower() != 'none']

X_bank = df_approved[features_list]

# Encode Bank Target using LabelEncoder
bank_encoder = LabelEncoder()
y_bank = bank_encoder.fit_transform(df_approved[target_bank].astype(str).str.strip())

X_train_bank, X_test_bank, y_train_bank, y_test_bank = train_test_split(X_bank, y_bank, test_size=0.2, random_state=42)

# Using Random Forest or XGBoost. We use XGBoost to match previous probability structure
bank_model = XGBClassifier(n_estimators=100, max_depth=6, random_state=42, use_label_encoder=False, eval_metric='mlogloss')
bank_model.fit(X_train_bank, y_train_bank)
print(f"Bank Model Train Accuracy: {bank_model.score(X_train_bank, y_train_bank):.4f}")
print(f"Bank Model Test Accuracy:  {bank_model.score(X_test_bank, y_test_bank):.4f}")

# 6. Save Models to disk
print("Saving models to .pkl files...")
with open("user_approval_model.pkl", "wb") as f:
    pickle.dump(approval_model, f)
    
with open("user_bank_recommendation_model.pkl", "wb") as f:
    pickle.dump(bank_model, f)
    
with open("bank_label_encoder.pkl", "wb") as f:
    pickle.dump(bank_encoder, f)
    
with open("approval_features.pkl", "wb") as f:
    pickle.dump(features_list, f)

print("✅ Training complete. Models successfully overwritten!")
