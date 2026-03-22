import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AdminService {
    private apiUrl = 'http://localhost:5000/admin';

    constructor(private http: HttpClient) { }

    login(credentials: any): Observable<any> {
        return this.http.post(`${this.apiUrl}/login`, credentials);
    }

    getDashboardStats(): Observable<any> {
        return this.http.get(`${this.apiUrl}/stats`);
    }

    getBankStats(): Observable<any> {
        return this.http.get(`${this.apiUrl}/bank-stats`);
    }

    getOfficerStats(): Observable<any> {
        return this.http.get(`${this.apiUrl}/officer-stats`);
    }

    getFraudCases(): Observable<any> {
        return this.http.get(`${this.apiUrl}/fraud-cases`);
    }

    getUsers(): Observable<any> {
        return this.http.get(`${this.apiUrl}/users`);
    }

    blockUser(userKey: string, action: 'block' | 'unblock'): Observable<any> {
        return this.http.post(`${this.apiUrl}/block-user`, { user_key: userKey, action });
    }
}
