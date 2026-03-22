import { Component, signal, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DOCUMENT, CommonModule } from '@angular/common';

export type ThemeMode = 'light' | 'dark' | 'system';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('loan-system');
  themeMode = signal<ThemeMode>('system');
  private document = inject(DOCUMENT);

  constructor() {
    const savedTheme = localStorage.getItem('theme') as ThemeMode;
    if (savedTheme) {
      this.themeMode.set(savedTheme);
    } else {
      this.themeMode.set('system');
    }

    effect(() => {
      const mode = this.themeMode();
      this.applyTheme(mode);
      localStorage.setItem('theme', mode);
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.themeMode() === 'system') {
        this.applyTheme('system');
      }
    });
  }

  setTheme(mode: ThemeMode) {
    this.themeMode.set(mode);
  }

  private applyTheme(mode: ThemeMode) {
    const isDark = mode === 'dark' || (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      this.document.documentElement.classList.add('dark');
    } else {
      this.document.documentElement.classList.remove('dark');
    }
  }
}
