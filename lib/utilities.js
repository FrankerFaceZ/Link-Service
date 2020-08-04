'use strict';

/**
 * Truncate a string. Tries to intelligently break the string in white-space
 * if possible, without back-tracking. The returned string can be up to
 * `ellipsis.length + target + overage` characters long.
 * @param {String} str The string to truncate.
 * @param {Number} target The target length for the result
 * @param {Number} overage Accept up to this many additional characters for a better result
 * @param {String} [ellipsis='…'] The string to append when truncating
 * @param {Boolean} [break_line=true] If true, attempt to break at the first LF
 * @param {Boolean} [trim=true] If true, runs trim() on the string before truncating
 * @returns {String} The truncated string
 */
export function truncate(str, target = 100, overage = 15, ellipsis = '…', break_line = true, trim = true) {
	if ( ! str || ! str.length )
		return str;

	if ( trim )
		str = str.trim();

	let idx = break_line ? str.indexOf('\n') : -1;
	if ( idx === -1 || idx > target )
		idx = target;

	if ( str.length <= idx )
		return str;

	let out = str.slice(0, idx).trimRight();
	if ( overage > 0 && out.length >= idx ) {
		let next_space = str.slice(idx).search(/\s+/);
		if ( next_space === -1 && overage + idx > str.length )
			next_space = str.length - idx;

		if ( next_space !== -1 && next_space <= overage ) {
			if ( str.length <= (idx + next_space) )
				return str;

			out = str.slice(0, idx + next_space);
		}
	}

	return out + ellipsis;
}


const SIZE_UNITS = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
const SIZE_FORMATTER = new Intl.NumberFormat('en-us', {maximumFractionDigits: 2});

/**
 * Format a file-size for readability.
 *
 * @param {Number} bytes The number of bytes
 * @returns {String} Formatted filesize.
 */
export function formatSize(bytes) {
	const sign = Math.sign(bytes) === -1 ? '-' : '';
	bytes = Math.abs(bytes);
	if ( bytes < 1000 )
		return `${sign}${bytes} B`;

	let u = -1;
	do {
		bytes /= 1000;
		++u;
	} while ( bytes >= 1000 && u < SIZE_UNITS.length - 1 );

	return `${sign}${SIZE_FORMATTER.format(bytes)} ${SIZE_UNITS[u]}`;
}
