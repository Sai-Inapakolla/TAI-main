import { Component, OnInit, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LoanService } from '../../../core/services/loan.service';

@Component({
  selector: 'app-user-result',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatRadioModule,
    FormsModule,
    RouterModule
  ],
  templateUrl: './user-result.html',
  styleUrl: './user-result.scss'
})
export class UserResult implements OnInit {
  loading = true;
  approved = false;
  banks: any[] = [];
  selectedBank: any;
  applicationId: string | null = null;
  private _loanService = inject(LoanService);

  // Dialog state
  showApplyDialog = false;
  applicantName = '';
  applicantMobile = '';

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit() {
    console.log('UserResult initialized. Reading state...');

    // Read state passed from eligibility component
    const state = history.state?.prediction;
    console.log('State received:', state);

    if (state && state.application_id) {
      this.applicationId = state.application_id;
    }

    // Simulate loading delay for effect (or remove it)
    setTimeout(() => {
      console.log('Timeout finished. Setting loading to false.');
      this.loading = false;

      if (state) {
        this.approved = state.approved;
        if (state.bank_list && state.bank_list.length > 0) {
          this.banks = state.bank_list.map((b: any) => ({
            ...b,
            // Assign dummy colors if missing
            color: this.getColor(b.name)
          }));
        } else if (state.bank) {
          this.banks = [{ name: state.bank, probability: 90, risk: 'Low', color: 'text-blue-800' }];
        }
      } else {
        // Fallback for direct access without state (could redirect back)
        console.warn('No state found, defaulting to rejected view.');
        this.approved = false;
      }

      // Force change detection
      this.cdr.detectChanges();
    }, 1000);
  }

  onProceed() {
    if (!this.selectedBank) {
      alert('Please select a bank first.');
      return;
    }

    if (!this.applicationId) {
      alert('Application ID reference lost. Please try applying again.');
      return;
    }

    // Show Dialog
    this.showApplyDialog = true;
  }

  closeDialog() {
    this.showApplyDialog = false;
    this.applicantName = '';
    this.applicantMobile = '';
  }

  confirmApply() {
    if (!this.applicantName || !this.applicantMobile) {
      alert('Please enter your Name and Mobile Number.');
      return;
    }

    this._loanService.apply(this.applicationId!, this.selectedBank.name, this.applicantName, this.applicantMobile).subscribe({
      next: (res) => {
        alert(`Application Submitted Successfully to ${this.selectedBank.name}! Our officer will contact you shortly.`);
        console.log(res);
        this.closeDialog();
      },
      error: (err) => {
        console.error(err);
        alert('Application request failed. ensure backend is running.');
      }
    });
  }

  getColor(name: string): string {
    if (name.includes('HDFC')) return 'text-blue-800 dark:text-blue-400';
    if (name.includes('ICICI')) return 'text-orange-600 dark:text-orange-400';
    if (name.includes('SBI') || name.includes('State Bank')) return 'text-blue-600 dark:text-blue-400';
    if (name.includes('Axis')) return 'text-pink-700 dark:text-pink-400';
    if (name.includes('Kotak')) return 'text-red-700 dark:text-red-400';
    if (name.includes('YES')) return 'text-blue-700 dark:text-blue-400';
    if (name.includes('IndusInd')) return 'text-amber-700 dark:text-amber-500';
    if (name.includes('IDFC')) return 'text-red-800 dark:text-red-400';
    if (name.includes('Bank of Baroda')) return 'text-orange-600 dark:text-orange-400';
    return 'text-gray-800 dark:text-slate-200';
  }
}
