import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-officer-login',
  standalone: true,
  imports: [CommonModule, FormsModule, MatInputModule, MatButtonModule, MatIconModule, MatSnackBarModule, RouterModule],
  templateUrl: './officer-login.html',
  styleUrl: './officer-login.scss'
})
export class OfficerLogin {
  private _snackBar = inject(MatSnackBar);
  private _router = inject(Router);

  name: string = '';
  sessionId: string = '';

  private officers = [
    { name: 'sai', session: '10101', bank: 'HDFC' },
    { name: 'saimadhu', session: '10102', bank: 'SBI' },
    { name: 'charith', session: '10103', bank: 'ICICI' },
    { name: 'dileep', session: '10104', bank: 'Axis' },
    { name: 'ram', session: '10105', bank: 'Kotak' },
    { name: 'charan', session: '10106', bank: 'IndusInd' },
    { name: 'kiran', session: '10107', bank: 'IDFC FIRST' },
    { name: 'akhil', session: '10108', bank: 'YES' },
    { name: 'vijay', session: '10109', bank: 'Bank of India' },
    { name: 'surya', session: '10100', bank: 'Bank of Baroda' }
  ];

  login() {
    const officer = this.officers.find(
      o => o.name.toLowerCase() === this.name.toLowerCase() && o.session === this.sessionId
    );

    if (officer) {
      this._snackBar.open(`Welcome Officer ${officer.name} (${officer.bank} Portal)`, 'Success', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'top'
      });

      localStorage.setItem('officerName', officer.name);
      localStorage.setItem('officerBank', officer.bank);

      this._router.navigate(['/officer/dashboard']);
    } else {
      this._snackBar.open('Invalid Officer Name or Session ID', 'Retry', {
        duration: 3000,
        panelClass: ['error-snackbar']
      });
    }
  }
}
