from flask import Flask, request, jsonify
from flask_cors import CORS
import pickle
import os
import sys

base_dir = os.path.dirname(os.path.abspath(__file__))
ml_dir = os.path.join(base_dir, "Models", "ML model")
officer_dir = os.path.join(base_dir, "Models", "officer models")
sys.path.append(ml_dir)
sys.path.append(officer_dir)

try:
    import prediction_script
except ImportError as e:
    print(f"Error importing prediction_script: {e}")
    prediction_script = None

try:
    import prediction as officer_prediction
except ImportError as e:
    print(f"Error importing officer prediction module: {e}")
    officer_prediction = None

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

# Global Variables for Models
approval_model = None
bank_model = None
bank_encoder = None
approval_features = []

def load_models():
    global approval_model, bank_model, bank_encoder, approval_features
    try:
        print("Loading models from:", ml_dir)
        
        with open(os.path.join(ml_dir, "user_approval_model.pkl"), "rb") as f:
            approval_model = pickle.load(f)
            
        with open(os.path.join(ml_dir, "user_bank_recommendation_model.pkl"), "rb") as f:
            bank_model = pickle.load(f)
            
        try:
            with open(os.path.join(ml_dir, "bank_label_encoder.pkl"), "rb") as f:
                bank_encoder = pickle.load(f)
        except Exception as e:
            print(f"Warning: Bank Encoder could not be loaded: {e}")
            bank_encoder = None
            
        try:
            with open(os.path.join(ml_dir, "approval_features.pkl"), "rb") as f:
                approval_features = pickle.load(f)
        except Exception as e:
            print(f"Warning: Feature list could not be loaded, using default: {e}")
            approval_features = ['Age', 'Gender', 'Marital_Status', 'Dependents', 'Education', 'Self_Employed', 
                                 'Work_Experience_Years', 'ApplicantIncome', 'CoapplicantIncome', 'Salary_Payment_Mode', 
                                 'Existing_EMI', 'Residential_Assets', 'Area', 'Loan_Purpose', 'LoanAmount', 'Loan_Amount_Term']

        print("Models loaded successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to load models: {e}")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ml_online', 'models_loaded': approval_model is not None})

@app.route('/predict', methods=['POST'])
def predict():
    if not approval_model:
        return jsonify({'error': 'Models not loaded'}), 500
        
    try:
        data = request.get_json()
        print("Received prediction request:", data)
        result = prediction_script.predict(
            data, 
            approval_model, 
            bank_model, 
            bank_encoder, 
            approval_features
        )
        print("Prediction result:", result)
        return jsonify(result)
    except Exception as e:
        print(f"Error during prediction: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/officer_predict', methods=['POST'])
def officer_predict_endpoint():
    if not officer_prediction:
        return jsonify({'error': 'Officer prediction module not loaded'}), 500
        
    try:
        data = request.get_json()
        print("Received officer prediction request:", data)
        result = officer_prediction.officer_predict(data)
        print("Officer prediction result:", result)
        return jsonify(result)
    except Exception as e:
        print(f"Error during officer prediction: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    load_models()
    # Run on Port 5001 to leave 5000 for Node.js
    app.run(debug=True, host='0.0.0.0', port=5001)
