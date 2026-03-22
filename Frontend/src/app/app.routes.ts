import { Routes } from '@angular/router';
import { LandingComponent } from './features/landing/landing';
import { UserEligibility } from './features/user/user-eligibility/user-eligibility';
import { UserResult } from './features/user/user-result/user-result';
import { OfficerLogin } from './features/officer/officer-login/officer-login';
import { OfficerDashboard } from './features/officer/officer-dashboard/officer-dashboard';
import { OfficerReview } from './features/officer/officer-review/officer-review';
import { AdminLogin } from './features/admin/admin-login/admin-login';
import { AdminDashboard } from './features/admin/admin-dashboard/admin-dashboard';

export const routes: Routes = [
    { path: '', component: LandingComponent },
    { path: 'user/eligibility', component: UserEligibility },
    { path: 'user/result', component: UserResult },

    // Officer
    { path: 'officer/login', component: OfficerLogin },
    { path: 'officer/dashboard', component: OfficerDashboard },
    { path: 'officer/review/:id', component: OfficerReview },

    // Admin
    { path: 'admin/login', component: AdminLogin },
    { path: 'admin/dashboard', component: AdminDashboard },

    { path: '**', redirectTo: '' }
];
