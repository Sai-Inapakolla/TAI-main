import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LoanService } from '../../../core/services/loan.service';

@Component({
  selector: 'app-user-application',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './user-application.html',
  styleUrl: './user-application.scss'
})
export class UserApplication implements OnInit {
  private _loanService = inject(LoanService);
  private _router = inject(Router);
  private _cdr = inject(ChangeDetectorRef);

  applicationId: string | null = null;
  selectedBank: string = '';
  submitting = false;
  submitted = false;

  // Form fields
  form = {
    name: '',
    aadhar_number: '',
    pan_number: '',
    mobile: '',
    email: '',
    date_of_birth: '',
    gender: '',
    marital_status: '',
    education: '',
    employment_type: '',
    civil_score: '',
    monthly_income: '',
    address: '',
    city: '',
    state: '',
    pincode: ''
  };

  // File references
  files: { [key: string]: File | null } = {
    aadhar_pdf: null,
    pan_pdf: null,
    photo: null,
    signature: null,
    income_proof: null,
    address_proof: null
  };

  fileLabels: { [key: string]: string } = {
    aadhar_pdf: 'Aadhar Card (PDF/Image)',
    pan_pdf: 'PAN Card (PDF/Image)',
    photo: 'Passport Photo',
    signature: 'Signature',
    income_proof: 'Income Proof (Salary Slip / IT Return)',
    address_proof: 'Address Proof (Utility Bill / Rent Agreement)'
  };

  ngOnInit() {
    const state = history.state;
    if (state?.application_id) {
      this.applicationId = state.application_id;
    }
    if (state?.selected_bank) {
      this.selectedBank = state.selected_bank;
    }

    if (!this.selectedBank) {
      console.warn('No bank selected. Redirecting...');
    }
  }

  onFileChange(event: Event, fieldName: string) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.files[fieldName] = input.files[0];
    }
  }

  getFileName(fieldName: string): string {
    return this.files[fieldName]?.name || '';
  }

  isFormValid(): boolean {
    return !!(
      this.form.name &&
      this.form.aadhar_number &&
      this.form.pan_number &&
      this.form.mobile &&
      this.form.date_of_birth &&
      this.form.gender &&
      this.form.education &&
      this.form.civil_score &&
      this.files['aadhar_pdf'] &&
      this.files['pan_pdf']
    );
  }

  onSubmit() {
    if (!this.isFormValid()) {
      alert('Please fill in all required fields and upload Aadhar & PAN documents.');
      return;
    }

    this.submitting = true;
    const formData = new FormData();

    // Add application context
    if (this.applicationId) formData.append('application_id', this.applicationId);
    formData.append('selected_bank', this.selectedBank);

    // Add all form fields
    for (const [key, value] of Object.entries(this.form)) {
      formData.append(key, value);
    }

    // Add files
    for (const [key, file] of Object.entries(this.files)) {
      if (file) {
        formData.append(key, file, file.name);
      }
    }

    this._loanService.submitApplication(formData).subscribe({
      next: (res) => {
        console.log('Application submitted:', res);
        this.submitting = false;
        this.submitted = true;
        this._cdr.detectChanges();
      },
      error: (err) => {
        console.error('Submission failed:', err);
        this.submitting = false;
        this._cdr.detectChanges();
        alert('Submission failed. Please ensure the backend server is running.');
      }
    });
  }

  goHome() {
    this._router.navigate(['/']);
  }
}
