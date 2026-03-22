import { Component } from '@angular/core';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../admin.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [MatInputModule, MatButtonModule, MatIconModule, RouterModule, FormsModule, CommonModule],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.scss'
})
export class AdminLogin {
  username = '';
  password = '';
  errorMessage = '';

  constructor(private adminService: AdminService, private router: Router) { }

  onLogin() {
    this.adminService.login({ username: this.username, password: this.password }).subscribe({
      next: (res) => {
        // Store token logic (mock)
        localStorage.setItem('admin_token', res.token);
        this.router.navigate(['/admin/dashboard']);
      },
      error: (err) => {
        this.errorMessage = 'Invalid credentials';
      }
    });
  }
}
