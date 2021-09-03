'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {truncate} from '../utilities';
import {i18nToken, formatToken, styleToken, flexToken, boxToken} from '../builder';

const LOGO = 'https://horaro.org/assets/images/favicons/favicon-192x192.5bd5263b.png',
	MATCHER = /^\/([^/]+\/[^/.]+)(?:$|\/|\.)/;

export default class Horaro extends Resolver {

	transformURL(url, ctx) {
		const match = MATCHER.exec(url.pathname);
		if ( ! match )
			return UseMetadata;

		ctx.cache_key = `horaro-${match[1]}`;
		return `https://horaro.org/${match[1]}.json?named=true`;
	}

	processBody(data, mode, ctx) {
		const schedule = data?.schedule;
		if ( ! schedule )
			return null;

		const start = new Date(1000 * schedule.start_t),
			now = new Date,
			started = start <= now;

		const columns = {};
		let desc_column;
		for (let i = 0; i < schedule.columns.length; i++) {
			const name = schedule.columns[i],
				visible = ! schedule.hidden_columns.includes(name);
			columns[i] = {name, visible};
			if ( desc_column == null && visible )
				desc_column = i;
		}

		if ( desc_column == null )
			desc_column = 0;

		const title = [
			schedule.name,
			styleToken({color: 'alt-2', weight: 'regular'}, ' • '),
			schedule.event.name
		];

		let current, next, last;
		for (let i = 0, l = schedule.items.length; i < l; i++) {
			const item = schedule.items[i];
			if ( ! item || ! item.scheduled_t )
				continue;

			if ( i === l - 1) {
				item.last = true;
				const item_end = new Date(1000 * (item.length_t + item.scheduled_t));
				if ( now < item_end )
					current = item;
				break;
			}

			const item_start = new Date(1000 * item.scheduled_t);
			if ( now >= item_start )
				continue;

			next = item;
			current = schedule.items[i - 1];
			break;
		}

		if ( ! current && ! next )
			last = schedule.items[schedule.items.length - 1];


		let subtitle, extra;
		if ( ! started )
			subtitle = [
				i18nToken('embed.horaro.starts-in', 'Starts {when}', {
					when: formatToken('relative', start)
				}),
				' • ',
				formatToken('datetime', start)
			];
		else {
			if ( current && current.data && current.data.length ) {
				subtitle = i18nToken('embed.horaro.sub-now', 'Current: {event}', {
					event: styleToken({weight: 'semibold'}, current.data[desc_column])
				});

				if ( next )
					extra = i18nToken('embed.horaro.sub-next', 'Up {when}: {event}', {
						when: formatToken('relative', new Date(1000 * next.scheduled_t)),
						event: styleToken({weight: 'semibold'}, next.data[desc_column])
					});
				else
					extra = i18nToken('embed.horaro.ends', 'Ends {when}', {
						when: formatToken('relative', new Date(1000 * (current.scheduled_t + current.length_t)))
					});

			} else
				subtitle = i18nToken('embed.horaro.event-ended', 'Event has ended');
		}

		let full = this.builder()
			.setLogo(LOGO, {aspect: 1})
			.setTitle(schedule.name)
			.setSubtitle(schedule.event.name)
			.addBox(
				{'mg-y': 'small', lines: 5, wrap: 'pre-wrap', markdown: true},
				truncate(schedule.description, 1000, undefined, undefined, false)
			);


		let till_change = 300;

		if ( current ) {
			full = full.addField(
				i18nToken('embed.horaro.current', 'Current'),
				makeDesc(current, columns)
			);

			const ends = new Date(1000 * (current.scheduled_t + current.length_t));
			if ( ends > now )
				till_change = Math.min(till_change, Math.ceil((ends - now) / 1000));
		}

		if ( next ) {
			full = full.addField(
				i18nToken('embed.horaro.next', 'Next'),
				makeDesc(next, columns)
			);

			const starts = new Date(1000 * next.scheduled_t);
			if ( starts > now )
				till_change = Math.min(till_change, Math.ceil((starts - now) / 1000));
		}

		if ( last )
			full = full.addField(
				i18nToken('embed.horaro.last', 'Last'),
				makeDesc(last, columns)
			);

		if ( till_change <= 0 )
			till_change = 300;
		else if ( till_change < 10 )
			till_change = 60;

		ctx.cache_opts = {
			ttl: till_change
		}

		return {
			v: 5,
			accent: '#00CC00',
			refresh_ttl: till_change,
			refresh: new Date(now.getTime() + (till_change * 1000)),

			short: this.builder()
				.setLogo(LOGO, {aspect: 1})
				.setTitle(title)
				.setSubtitle(subtitle)
				.setExtra(extra),

			full
		}

	}
}

Horaro.hosts = ['horaro.org'];
Horaro.examples = [{title: 'Event', url: 'https://horaro.org/esa/2021-winter'}];

function makeDesc(item, columns) {
	const bits = item.data.filter((val, i) => columns[i].visible),
		times = [];

	const now = new Date,
		start = new Date(1000 * item.scheduled_t),
		end = new Date(1000 * (item.scheduled_t + item.length_t));

	if ( end > now ) {
		/*if ( start < now )
			times.push(i18nToken('embed.horaro.started', 'Started {when}', {
				when: formatToken('relative', start)
			}));
		else*/
		if ( start > now )
			times.push(i18nToken('embed.horaro.starts', 'Starts {when}', {
				when: formatToken('relative', start)
			}));
	}

	if ( start <= now ) {
		if ( times.length )
			times.push(' • ');

		if ( end <= now )
			times.push(i18nToken('embed.horaro.ended', 'Ended {when}', {
				when: formatToken('relative', end)
			}));
		else
			times.push(i18nToken('embed.horaro.ends', 'Ends {when}', {
				when: formatToken('relative', end)
			}));
	}

	const end_date = Math.abs(end - start) > 86400000,
		start_date = end_date || Math.abs(start - now) > 86400000;

	if ( times.length )
		times.push(' • ');

	times.push(i18nToken('embed.horaro.range', '{start} to {end}', {
		start: formatToken(start_date ? 'datetime' : 'time', start),
		end: formatToken(end_date ? 'datetime' : 'time', end)
	}));

	times.push(' • ');
	times.push(formatToken('duration', item.length_t));

	return flexToken({direction: 'column'}, [
		styleToken({}, times),
		bits.length ? boxToken({ellipsis: true}, styleToken({italic: true, markdown: true}, bits.join(' • '))) : null
	]);
}

/*function makeDesc(item, columns) {
	const bits = item.data.filter((val, i) => columns[i].visible),
		first = bits.shift();

	return [
		formatToken('time', new Date(1000 * item.scheduled_t)),
		' • ',
		first,
		' • ',
		formatToken('duration', item.length_t),
		bits.length ? ' • ' : null,
		bits.length ? bits.join(' • ') : null
	];
}*/
