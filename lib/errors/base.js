'use strict';

export default class BaseError extends Error {
	constructor(message, extra) {
		super(message);

		Error.captureStackTrace(this, this.constructor);
		Object.defineProperty(this, 'name', {
			value: this.constructor.name
		});
		this.extra = extra;
	}
}
