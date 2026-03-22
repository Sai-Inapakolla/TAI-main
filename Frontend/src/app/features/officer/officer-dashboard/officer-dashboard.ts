import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { LoanService } from '../../../core/services/loan.service';

@Component({
  selector: 'app-officer-dashboard',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule],
  templateUrl: './officer-dashboard.html',
  styleUrl: './officer-dashboard.scss'
})
export class OfficerDashboard implements OnInit {
  private _loanService = inject(LoanService);
  private _cdr = inject(ChangeDetectorRef);

  officerBank: string = 'Bank';
  officerName: string = 'Officer';
  applications: any[] = [];
  loading = true;

  stats = {
    total: 0,
    approved: 0,
    pending: 0,
    highRisk: 0,
    approvalRate: 0
  };

  constructor() {
    this.officerBank = localStorage.getItem('officerBank') || 'Bank';
    this.officerName = localStorage.getItem('officerName') || 'Officer';
  }

  ngOnInit() {
    this.loadApplications();
  }

  loadApplications() {
    this.loading = true;
    console.log('Loading applications for:', this.officerBank);

    this._loanService.getApplications(this.officerBank).subscribe({
      next: (apps) => {
        console.log('Received applications:', apps);

        const total = apps.length;
        const approved = apps.filter(a => String(a.status).toLowerCase() === 'approved').length;
        const pending = apps.filter(a => String(a.status).toLowerCase() === 'applied' || String(a.status).toLowerCase() === 'pending').length;
        const approvalRate = total > 0 ? Math.round((approved / total) * 100) : 0;

        this.applications = apps.map(app => {
          let risk = 'Pending Analysis';
          const bankName = this.officerBank;

          if (app.prediction && app.prediction.bank_list) {
            const bankData = app.prediction.bank_list.find((b: any) => b.name === bankName);
            if (bankData && bankData.risk) {
              risk = bankData.risk;
            } else if (app.prediction.risk) {
              risk = app.prediction.risk;
            }
          }

          return {
            id: app._id,
            name: app.input?.Name || app.input?.name || 'Applicant ' + app._id.substr(-4),
            income: app.input?.ApplicantIncome || app.input?.applicantIncome || 0,
            loanAmount: app.input?.LoanAmount || app.input?.loanAmount || 0,
            risk: risk,
            status: app.status || 'Pending'
          };
        });

        const highRisk = this.applications.filter(a => String(a.risk).toLowerCase() === 'high').length;

        // Update stats with new object trigger change detection
        this.stats = {
          total,
          approved,
          pending,
          highRisk,
          approvalRate
        };

        this.loading = false;
        this._cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load applications', err);
        this.loading = false;
        this._cdr.detectChanges();
      }
    });
  }

  getStatusColor(status: string) {
    const s = String(status).toLowerCase();
    if (s === 'approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800/50';
    if (s === 'rejected') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800/50';
    if (s === 'pending' || s === 'applied') return 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800/50';
    return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800/50';
  }
}
