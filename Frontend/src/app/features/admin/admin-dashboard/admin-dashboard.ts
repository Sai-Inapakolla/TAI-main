import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule, Router } from '@angular/router';
import { AdminService } from '../admin.service';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, RouterModule, BaseChartDirective],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss'
})
export class AdminDashboard implements OnInit {
  currentView: 'dashboard' | 'banks' | 'officers' | 'fraud' | 'users' = 'dashboard';
  isDarkMode = true; // Default to dark

  stats: any = {
    total_applications: 0,
    approved_loans: 0,
    rejected_loans: 0,
    fraud_reports: 0,
    active_officers: 0,
    blocked_users: 0
  };

  // --- Chart Configurations ---

  // 1. Overview Chart (System Status)
  public overviewChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: false } }
  };
  public overviewChartType: ChartType = 'bar';
  public overviewChartData: ChartData<'bar'> = {
    labels: ['Approved', 'Rejected', 'Fraud'],
    datasets: [{ data: [], label: 'Applications', backgroundColor: ['#4ade80', '#f87171', '#fb923c'] }]
  };

  // 2. Bank Analytics Data
  public barChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: true } }
  };
  public barChartType: ChartType = 'bar';
  public barChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Approved', backgroundColor: '#4ade80' },
      { data: [], label: 'Rejected', backgroundColor: '#f87171' },
      { data: [], label: 'Fraud', backgroundColor: '#fb923c' }
    ]
  };

  // 3. Officer Analytics Data
  public officerChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: false } }
  };
  public officerChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [{ data: [], label: 'Processed Applications', backgroundColor: '#818cf8' }]
  };

  // 4. Fraud Analytics Data
  public fraudChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: true } }
  };
  public fraudChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [{ data: [], label: 'Cases', backgroundColor: '#f472b6' }]
  };

  constructor(private adminService: AdminService, private router: Router) { }

  ngOnInit() {
    this.initializeTheme();
    this.fetchDashboardStats();
    // Pre-fetch bank stats for chart
    this.fetchBankStats();
  }

  initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      this.isDarkMode = savedTheme === 'dark';
    } else {
      this.isDarkMode = true; // Default preference
    }
    this.applyTheme();
  }

  toggleTheme() {
    this.isDarkMode = !this.isDarkMode;
    localStorage.setItem('theme', this.isDarkMode ? 'dark' : 'light');
    this.applyTheme();
  }

  applyTheme() {
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  fetchDashboardStats() {
    this.adminService.getDashboardStats().subscribe({
      next: (data) => {
        this.stats = data;
        this.processOverviewChart(data);
      },
      error: (err) => console.error(err)
    });
  }

  processOverviewChart(data: any) {
    this.overviewChartData = {
      labels: ['Approved', 'Rejected', 'Fraud'],
      datasets: [{
        data: [data.approved_loans, data.rejected_loans, data.fraud_reports],
        label: 'Applications',
        backgroundColor: ['#4ade80', '#f87171', '#fb923c'],
        hoverBackgroundColor: ['#22c55e', '#ef4444', '#f97316']
      }]
    };
  }

  fetchBankStats() {
    this.adminService.getBankStats().subscribe({
      next: (data) => {
        this.processBankChartData(data);
      }
    });
  }

  processBankChartData(data: any) {
    const banks = Object.keys(data);
    const approved: number[] = [];
    const rejected: number[] = [];
    const fraud: number[] = [];

    banks.forEach(bank => {
      approved.push(data[bank].approved);
      rejected.push(data[bank].rejected);
      fraud.push(data[bank].fraud);
    });

    this.barChartData = {
      labels: banks,
      datasets: [
        { data: approved, label: 'Approved', backgroundColor: '#4ade80' },
        { data: rejected, label: 'Rejected', backgroundColor: '#f87171' },
        { data: fraud, label: 'Fraud', backgroundColor: '#fb923c' }
      ]
    };
  }

  // Data storage
  officers: any[] = [];
  fraudCases: any[] = [];
  users: any[] = [];

  setView(view: 'dashboard' | 'banks' | 'officers' | 'fraud' | 'users') {
    this.currentView = view;
    if (view === 'officers' && this.officers.length === 0) this.fetchOfficerStats();
    if (view === 'fraud') this.fetchFraudCases(); // Refresh always for fraud
    if (view === 'users' && this.users.length === 0) this.fetchUsers();
  }

  fetchOfficerStats() {
    this.adminService.getOfficerStats().subscribe({
      next: (data) => {
        this.officers = data;
        this.processOfficerChart(data);
      }
    });
  }

  processOfficerChart(data: any[]) {
    this.officerChartData = {
      labels: data.map(o => o.name),
      datasets: [{
        data: data.map(o => o.processed),
        label: 'Processed Applications',
        backgroundColor: '#818cf8',
        hoverBackgroundColor: '#6366f1'
      }]
    };
  }

  fetchFraudCases() {
    this.adminService.getFraudCases().subscribe({
      next: (data) => {
        this.fraudCases = data;
        this.processFraudChart(data);
      }
    });
  }

  processFraudChart(data: any[]) {
    // Group by status
    const statusCounts: { [key: string]: number } = {};
    data.forEach(item => {
      const status = item.status || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    this.fraudChartData = {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        label: 'Fraud Cases',
        backgroundColor: '#f472b6',
        hoverBackgroundColor: '#ec4899'
      }]
    };
  }

  // User Analytics Data
  public userBarChartOptions: ChartConfiguration['options'] = {
    responsive: true,
    plugins: { legend: { display: true } }
  };
  public userBarChartType: ChartType = 'bar';
  public userBarChartData: ChartData<'bar'> = {
    labels: [],
    datasets: [
      { data: [], label: 'Number of Applications', backgroundColor: '#3b82f6' }
    ]
  };

  fetchUsers() {
    this.adminService.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.processUserChartData(data);
      }
    });
  }

  processUserChartData(data: any[]) {
    // Sort by application count descending
    const sortedUsers = [...data].sort((a, b) => b.applications - a.applications).slice(0, 10);

    this.userBarChartData = {
      labels: sortedUsers.map(u => u.name),
      datasets: [
        {
          data: sortedUsers.map(u => u.applications),
          label: 'Total Applications',
          backgroundColor: '#3b82f6',
          hoverBackgroundColor: '#60a5fa'
        }
      ]
    };
  }

  toggleBlockUser(user: any) {
    const action = user.is_blocked ? 'unblock' : 'block';
    const key = `${user.name}|${user.mobile}`; // Construct key as per backend expectation

    this.adminService.blockUser(key, action).subscribe({
      next: () => {
        user.is_blocked = !user.is_blocked; // Optimistic update
        this.fetchDashboardStats(); // Refresh stats
      }
    });
  }

  logout() {
    localStorage.removeItem('admin_token');
    this.router.navigate(['/admin/login']);
  }
}
