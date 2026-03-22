import { Component, inject } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule, FormGroup } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LoanService } from '../../../core/services/loan.service';

@Component({
  selector: 'app-user-eligibility',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatStepperModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatRadioModule
  ],
  templateUrl: './user-eligibility.html',
  styleUrl: './user-eligibility.scss'
})
export class UserEligibility {
  private _formBuilder = inject(FormBuilder);
  private _router = inject(Router);
  private _loanService = inject(LoanService);
  isSubmitting = false;

  firstFormGroup = this._formBuilder.group({
    age: ['', [Validators.required, Validators.min(18)]],
    gender: ['', Validators.required],
    maritalStatus: ['', Validators.required],
    dependents: ['', Validators.required],
    education: ['', Validators.required],
    area: ['', Validators.required]
  });

  secondFormGroup = this._formBuilder.group({
    selfEmployed: ['', Validators.required],
    experience: ['', Validators.required],
    applicantIncome: ['', [Validators.required, Validators.min(0)]],
    coApplicantIncome: ['0', [Validators.min(0)]],
    salaryMode: ['', Validators.required]
  });

  thirdFormGroup = this._formBuilder.group({
    existingEmi: ['', Validators.min(0)],
    assets: ['', Validators.required],
    loanPurpose: ['', Validators.required],
    loanAmount: ['', [Validators.required, Validators.min(1000)]],
    tenure: ['', Validators.required]
  });

  isLinear = true;

  submit() {
    if (this.firstFormGroup.invalid || this.secondFormGroup.invalid || this.thirdFormGroup.invalid) {
      return;
    }

    this.isSubmitting = true;

    const data = {
      ...this.firstFormGroup.value,
      ...this.secondFormGroup.value,
      ...this.thirdFormGroup.value
    };

    console.log('Sending data to backend:', data);

    this._loanService.predict(data).subscribe({
      next: (response) => {
        console.log('Backend response:', response);
        this.isSubmitting = false;
        // Navigate to result with state
        this._router.navigate(['/user/result'], {
          state: {
            prediction: response
          }
        });
      },
      error: (err) => {
        console.error('Error submitting loan application:', err);
        this.isSubmitting = false;
        // Optionally show error message
        alert('Failed to connect to prediction server. Please ensure Flask app is running.');
      }
    });
  }
}
