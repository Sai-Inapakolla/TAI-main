import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { LoanService } from '../../../core/services/loan.service';

@Component({
  selector: 'app-officer-review',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatCardModule, MatInputModule, MatSnackBarModule, RouterModule],
  templateUrl: './officer-review.html',
  styleUrl: './officer-review.scss'
})
export class OfficerReview implements OnInit {
  private _snackBar = inject(MatSnackBar);
  private _router = inject(Router);
  private _route = inject(ActivatedRoute);
  private _loanService = inject(LoanService);

  applicationId: string = '';
  loading = true;

  // The raw application data from database
  rawApplication: any = null;

  applicant: any = {
    id: '',
    name: 'Loading...',
    age: 0,
    gender: '-',
    occupation: '-',
    income: 0,
    loanAmount: 0,
    tenure: 0,
    creditScore: 0, // This will be the modeled/input CIBIL
    risk: 'Pending Analysis',
    approvalProbability: 0,
    eligibleAmount: 0 // Initialize eligibleAmount
  };

  // Input for the officer (Final CIBIL)
  finalCibilScore: number | null = null;
  predictionResult: any = null;

  ngOnInit() {
    this.applicationId = this._route.snapshot.paramMap.get('id') || '';
    if (this.applicationId) {
      this.loadApplication(this.applicationId);
    } else {
      this._snackBar.open('Invalid Application ID', 'Close');
      this._router.navigate(['/officer/dashboard']);
    }
  }

  loadApplication(id: string) {
    this.loading = true;
    this._loanService.getApplicationById(id).subscribe({
      next: (app) => {
        this.rawApplication = app;
        const input = app.input || {};

        // Helper to get value from either TitleCase or camelCase
        const getVal = (keyTitle: string, keyCamel: string) => input[keyTitle] !== undefined ? input[keyTitle] : input[keyCamel];

        this.applicant = {
          id: app._id,
          name: input.Name || input.name || 'Applicant ' + app._id.substr(-4),
          mobile: input.Mobile || input.mobile || 'N/A',
          age: getVal('Age', 'age'),
          gender: getVal('Gender', 'gender'), // Likely string "Male"/"Female"
          occupation: (getVal('Self_Employed', 'selfEmployed') === 'Yes' || getVal('Self_Employed', 'selfEmployed') === 1) ? 'Self Employed' : 'Salaried',
          income: getVal('ApplicantIncome', 'applicantIncome'),
          loanAmount: getVal('LoanAmount', 'loanAmount'),
          tenure: getVal('Loan_Amount_Term', 'tenure'),
          creditScore: getVal('Hidden_CIBIL', 'creditScore') || 0,
          risk: 'Pending Analysis',
          approvalProbability: 0
        };

        // Normalize Gender display if it came as 1/0
        if (this.applicant.gender === 1) this.applicant.gender = 'Male';
        if (this.applicant.gender === 0) this.applicant.gender = 'Female';

        // Pre-fill if available
        // The instruction implies to leave finalCibilScore null so the user can optionally enter it.
        // If they click Analyze with empty, we use system.
        // if (input.Hidden_CIBIL) {
        //   this.finalCibilScore = input.Hidden_CIBIL;
        // }

        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading application', err);
        this._snackBar.open('Failed to load application details', 'Close');
        this.loading = false;
      }
    });
  }

  runPrediction() {
    // If user didn't enter a score, try to use the existing one from the application
    let cibilToUse = this.finalCibilScore;

    if (!cibilToUse) {
      if (this.applicant.creditScore > 0) {
        cibilToUse = this.applicant.creditScore;
        this._snackBar.open('Using system estimated CIBIL Score for analysis.', 'Info', { duration: 3000 });
      } else {
        this._snackBar.open('Please enter a valid Final CIBIL Score', 'Close');
        return;
      }
    }

    // Merge original input with new CIBIL score
    const modelInput = {
      ...this.rawApplication.input,
      "Hidden_CIBIL": cibilToUse,
      "Approved_Bank": this.getBankId(this.rawApplication.selected_bank || '')
    };

    console.log('Sending data to Officer Model:', modelInput);

    this._loanService.officerPredict(modelInput).subscribe({
      next: (res: any) => {
        console.log('Officer Model Prediction:', res);
        this.predictionResult = res;
        this._snackBar.open('Officer Insights Calculated', 'Close', { duration: 2000 });

        this.applicant.creditScore = cibilToUse;

        // Update local UI state based on model
        if (res.Fraud_Label_Model === 1 || res.Fraud_Label_Rule === 1) {
          this.applicant.risk = 'High (Fraud Detected)';
          this.applicant.approvalProbability = 10;
        } else if (res.Officer_Approved_Model === 1) {
          this.applicant.risk = 'Low (Model Approved)';
          this.applicant.approvalProbability = 95;
        } else {
          this.applicant.risk = 'Medium (Model Rejected)';
          this.applicant.approvalProbability = 45;
        }

        if (res.Eligible_Loan_Amount_Model) {
          this.applicant.eligibleAmount = res.Eligible_Loan_Amount_Model;
        }
      },
      error: (err: any) => {
        console.error('Error fetching prediction:', err);
        this._snackBar.open('Failed to get ML Insights', 'Close', { duration: 3000 });
      }
    });
  }

  getBankId(bankName: string): number {
    const mapping: { [key: string]: number } = {
      'HDFC': 0, 'HDFC Bank': 0,
      'SBI': 1, 'State Bank of India': 1,
      'ICICI': 2, 'ICICI Bank': 2,
      'Axis': 3, 'Axis Bank': 3,
      'Kotak': 4, 'Kotak Mahindra Bank': 4,
      'IndusInd': 5, 'IndusInd Bank': 5,
      'IDFC FIRST': 6, 'IDFC FIRST Bank': 6,
      'YES': 7, 'YES Bank': 7,
      'Bank of India': 8,
      'Bank of Baroda': 9
    };

    // Simple partial match if exact match fails
    if (mapping[bankName] !== undefined) return mapping[bankName];

    for (const key in mapping) {
      if (bankName.toLowerCase().includes(key.toLowerCase())) {
        return mapping[key];
      }
    }
    return 0; // Default to HDFC if unknown

  }

  approveLoan() {
    this._loanService.updateStatus(this.applicationId, 'approved').subscribe({
      next: () => {
        this._snackBar.open('Loan Approved Successfully', 'Close', { duration: 3000 });
        this._router.navigate(['/officer/dashboard']);
      },
      error: (err) => {
        console.error(err);
        this._snackBar.open('Error: Could not sync status with database.', 'Close', { duration: 3000 });
      }
    });
  }

  rejectLoan() {
    this._loanService.updateStatus(this.applicationId, 'rejected').subscribe({
      next: () => {
        this._snackBar.open('Loan Rejected', 'Close', { duration: 3000 });
        this._router.navigate(['/officer/dashboard']);
      },
      error: (err) => {
        console.error(err);
        this._snackBar.open('Error: Could not sync status with database.', 'Close', { duration: 3000 });
      }
    });
  }
}
