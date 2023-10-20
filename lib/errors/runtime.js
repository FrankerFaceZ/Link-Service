'use strict';

import BaseError from './base';
import {i18nToken} from '../builder';

export class RuntimeError extends BaseError {}

export class RedirectLoopError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.redirect-loop', 'Redirect Loop')
	}
}

export class TooManyRedirectsError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.redirects', 'Too Many Redirects')
	}
}

export class UnhandledURLError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.unhandled', 'No handler supports this URL.')
	}
}

export class NetworkError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.network', 'A network error occured.')
	}
}

export class TimeoutError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.timeout', 'The request timed out.')
	}
}

export class NotFoundError extends RuntimeError {
	status = 404;

	getMessage() {
		return i18nToken('card.error.404', 'The server returned a 404 Not Found response.')
	}
}

export class BadRequestError extends RuntimeError {
	status = 400;

	getMessage() {
		return i18nToken('card.error.400', 'The server returned a 400 Bad Request response.')
	}
}

export class UnauthorizedError extends RuntimeError {
	status = 401;

	getMessage() {
		return i18nToken('card.error.401', 'The server returned a 401 Unauthorized response.')
	}
}

export class ForbiddenError extends RuntimeError {
	status = 403;

	getMessage() {
		return i18nToken('card.error.403', 'The server returned a 403 Forbidden response.')
	}
}

export class ServerError extends RuntimeError {
	getMessage() {
		return i18nToken('card.error.500', 'The server returned a 5xx server error response.')
	}
}


export default RuntimeError;
