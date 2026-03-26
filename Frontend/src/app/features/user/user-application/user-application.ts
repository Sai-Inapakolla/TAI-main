import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { LoanService } from '../../../core/services/loan.service';

interface DocumentSlot {
  key: string;
  label: string;
  description: string;
  icon: string;
  required: boolean;
  file: File | null;
  accept: string;
}

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

  // Stepper: 1=Upload, 2=Scanning, 3=Review, 4=Success
  currentStep = 1;
  scanProgress = 0;
  scanStatus = '';
  submitting = false;

  // Document upload slots
  documents: DocumentSlot[] = [
    { key: 'aadhar', label: 'Aadhar Card', description: 'Front side of your Aadhar card', icon: 'badge', required: true, file: null, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'pan', label: 'PAN Card', description: 'Clear image of your PAN card', icon: 'credit_card', required: true, file: null, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'passbook', label: 'Bank Passbook', description: 'First page with account details', icon: 'account_balance', required: true, file: null, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'salary_slip', label: 'Salary Statement', description: 'Latest month salary slip', icon: 'payments', required: true, file: null, accept: '.pdf,.jpg,.jpeg,.png' },
    { key: 'bank_statement', label: 'Bank Statement (6 months)', description: 'Past 6 months bank statement', icon: 'receipt_long', required: true, file: null, accept: '.pdf,.jpg,.jpeg,.png' }
  ];

  // Extracted data & Cloudinary URLs
  cloudinaryUrls: any = {};
  autoFilled: Set<string> = new Set();

  form: any = {
    name: '', aadhar_number: '', pan_number: '', date_of_birth: '',
    gender: '', address: '', pincode: '', father_name: '',
    account_number: '', ifsc_code: '', bank_name: '', branch: '',
    monthly_income: '', employer: '', employment_type: '',
    mobile: '', email: '', marital_status: '', education: '',
    civil_score: '', city: '', state: ''
  };

  ngOnInit() {
    const state = history.state;
    if (state?.application_id) this.applicationId = state.application_id;
    if (state?.selected_bank) this.selectedBank = state.selected_bank;
  }

  // ── File Handling ──────────────────────────────────────────

  onFileSelect(event: Event, docKey: string) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const doc = this.documents.find(d => d.key === docKey);
      if (doc) { doc.file = input.files[0]; this._cdr.detectChanges(); }
    }
  }

  onFileDrop(event: DragEvent, docKey: string) {
    event.preventDefault();
    event.stopPropagation();
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const doc = this.documents.find(d => d.key === docKey);
      if (doc) { doc.file = files[0]; this._cdr.detectChanges(); }
    }
  }

  onDragOver(event: DragEvent) { event.preventDefault(); event.stopPropagation(); }

  removeFile(docKey: string) {
    const doc = this.documents.find(d => d.key === docKey);
    if (doc) doc.file = null;
    this._cdr.detectChanges();
  }

  getUploadedCount(): number { return this.documents.filter(d => d.file !== null).length; }

  canScan(): boolean { return this.documents.filter(d => d.required).every(d => d.file !== null); }

  // ── Scan Documents ─────────────────────────────────────────

  startScan() {
    if (!this.canScan()) return;
    this.currentStep = 2;
    this.scanProgress = 0;
    this.scanStatus = 'Preparing documents...';

    const formData = new FormData();
    for (const doc of this.documents) {
      if (doc.file) formData.append(doc.key, doc.file, doc.file.name);
    }
    if (this.applicationId) formData.append('application_id', this.applicationId);
    formData.append('selected_bank', this.selectedBank);

    // Animated progress
    const progressInterval = setInterval(() => {
      if (this.scanProgress < 90) {
        this.scanProgress += Math.random() * 12;
        if (this.scanProgress > 90) this.scanProgress = 90;
        if (this.scanProgress < 25) this.scanStatus = 'Uploading documents to cloud...';
        else if (this.scanProgress < 50) this.scanStatus = 'Running AI text extraction...';
        else if (this.scanProgress < 75) this.scanStatus = 'Parsing Aadhar, PAN & Passbook...';
        else this.scanStatus = 'Analyzing salary & bank statements...';
        this._cdr.detectChanges();
      }
    }, 600);

    this._loanService.scanDocuments(formData).subscribe({
      next: (res) => {
        clearInterval(progressInterval);
        this.scanProgress = 100;
        this.scanStatus = 'Scan complete!';
        if (res.extracted_data) this.populateForm(res.extracted_data);
        if (res.cloudinary_urls) this.cloudinaryUrls = res.cloudinary_urls;
        this._cdr.detectChanges();
        setTimeout(() => { this.currentStep = 3; this._cdr.detectChanges(); }, 800);
      },
      error: (err) => {
        clearInterval(progressInterval);
        console.error('Scan failed:', err);
        this.scanStatus = 'Scan failed. Please try again.';
        setTimeout(() => { this.currentStep = 1; this._cdr.detectChanges(); }, 2000);
      }
    });
  }

  populateForm(data: any) {
    for (const key of Object.keys(this.form)) {
      if (data[key] && String(data[key]).trim()) {
        this.form[key] = data[key];
        this.autoFilled.add(key);
      }
    }
  }

  isAutoFilled(field: string): boolean { return this.autoFilled.has(field); }

  // ── Submit ─────────────────────────────────────────────────

  isReviewFormValid(): boolean {
    return !!(this.form.name && this.form.aadhar_number && this.form.pan_number);
  }

  onSubmit() {
    if (!this.isReviewFormValid()) {
      alert('Please ensure Name, Aadhar Number, and PAN Number are filled.');
      return;
    }
    this.submitting = true;
    const payload = {
      application_id: this.applicationId,
      selected_bank: this.selectedBank,
      applicant: { ...this.form },
      documents: this.cloudinaryUrls
    };
    this._loanService.submitScannedApplication(payload).subscribe({
      next: () => { this.submitting = false; this.currentStep = 4; this._cdr.detectChanges(); },
      error: (err) => {
        this.submitting = false;
        console.error('Submission failed:', err);
        alert('Submission failed. Please try again.');
        this._cdr.detectChanges();
      }
    });
  }

  goHome() { this._router.navigate(['/']); }

  goBack() {
    if (this.currentStep === 3) this.currentStep = 1;
    this._cdr.detectChanges();
  }
}
