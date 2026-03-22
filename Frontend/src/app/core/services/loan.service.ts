
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class LoanService {
    private http = inject(HttpClient);
    // Backend URL (Flask running on port 5000)
    private apiUrl = 'http://localhost:5000/predict';

    predict(data: any): Observable<any> {
        return this.http.post<any>(this.apiUrl, data);
    }

    apply(applicationId: string, bankName: string, applicantName?: string, mobileNumber?: string): Observable<any> {
        return this.http.post<any>('http://localhost:5000/apply', {
            application_id: applicationId,
            bank_name: bankName,
            applicant_name: applicantName,
            applicant_mobile: mobileNumber
        });
    }

    officerPredict(data: any): Observable<any> {
        return this.http.post<any>('http://localhost:5000/officer_predict', data);
    }

    getApplications(bankName: string): Observable<any[]> {
        return this.http.get<any[]>('http://localhost:5000/applications', {
            params: { bank: bankName }
        });
    }

    getApplicationById(id: string): Observable<any> {
        return this.http.get<any>(`http://localhost:5000/application/${id}`);
    }

    updateStatus(applicationId: string, status: string): Observable<any> {
        return this.http.post<any>('http://localhost:5000/update_status', {
            application_id: applicationId,
            status: status
        });
    }
}
