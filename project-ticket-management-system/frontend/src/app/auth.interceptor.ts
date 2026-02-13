import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export const SESSION_EXPIRED_EVENT = 'app-session-expired';

const broadcastSessionExpiry = () => {
  try {
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
  } catch (error) {
    console.error('Unable to clear auth storage after 401', error);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  let token: string | null = null;
  try {
    token = localStorage.getItem('authToken');
  } catch (error) {
    token = null;
  }

  const authReq = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : req;

  return next(authReq).pipe(
    catchError((error) => {
      if (token && error instanceof HttpErrorResponse && error.status === 401) {
        broadcastSessionExpiry();
      }
      return throwError(() => error);
    })
  );
};
