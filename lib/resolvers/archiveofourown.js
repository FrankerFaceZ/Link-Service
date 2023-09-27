'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import {formatToken, i18nToken, imageToken, linkToken, refToken, styleToken} from '../builder';

const LOGO_URL = 'https://archiveofourown.org/images/ao3_logos/logo.png';

const WORK_URL_ONE = /^\/works\/(\d+)(?:\/|$)/i,
	WORK_URL_TWO = /^\/collections\/[^\/]+\/works\/(\d+)(?:\/|$)/i;

function tokenizeNode(node) {
	if (! node)
		return null;

	if (Array.isArray(node)) {
		const result = [];
		let want_line = false;

		for(const child of node) {
			const val = tokenizeNode(child);
			if (val) {
				if (want_line) {
					result.push('\n\n');
					want_line = false;
				}
				if (Array.isArray(val)) {
					for(const v of val)
						result.push(v);
				} else
					result.push(val);
			}

			want_line = want_line || (child.type == 'tag' && child.name == 'p');
		}

		return result;
	}

	if (node.type === 'text')
		return node.data;

	if (node.type !== 'tag') {
		console.log('unknown node type', node);
		return null;
	}

	const tag = node.name;
	if (tag === 'body') {
		// Body.
		return tokenizeNode(node.children);
	}

	if (tag === 'a') {
		// Link
		let ret = tokenizeNode(node.children);
		if (!ret)
			return ret;

		return linkToken(
			node.attribs.href,
			ret
		);

	} else if (tag === 'span') {
		// Span
		const cls = node.attribs?.class;
		if (cls === 'invisible')
			return null;

		let ret = tokenizeNode(node.children);
		if (!ret)
			return null;

		if (cls === 'ellipsis') {
			if (Array.isArray(ret))
				ret.push('…');
			else
				ret = [ret, '…'];
		}

		return ret;

	} else if (tag === 'p') {
		// Paragraph
		return tokenizeNode(node.children);

	} else if (tag === 'br') {
		return '\n';

	} else {
		// ???
		console.log('disallowed tag', tag);
		return tokenizeNode(node.children);
	}
}

function readString(body, rule, first = false) {
	if ( body && rule )
		body = body(rule);

	if ( ! body || ! body.length )
		return null;

	if ( first )
		body = body.first();

	return body.text().trim();
}

function readInt(body, rule, first = false) {
	const value = readString(body, rule, first);
	if ( value == null )
		return null;

	const val = parseInt(value.replace(/,/g, ''), 10);
	if ( Number.isNaN(val) )
		return null;

	return val;
}

export default class ArchiveOfOurOwn extends Resolver {

	transformURL(url, ctx) {
		let match = WORK_URL_ONE.exec(url.pathname) ?? WORK_URL_TWO.exec(url.pathname);

		if ( match ) {
			//console.log('match', match[1]);
			ctx.mode = 'work';
			ctx.follow_redirects = 'immediate';
			return `https://archiveofourown.org/works/${match[1]}?view_adult=true`;
		}

		return UseMetadata;
	}

	processBody(body, mode, ctx) {
		if ( ! body || mode !== 'html' )
			return;

		if ( ctx.mode === 'work' )
			return this.processWork(body, ctx);
	}

	processWork(body, ctx) {

		const fragments = {},

			title = readString(body, '.preface.group > h2.title', true),

			anchor = body('a[rel=author]').first(),
			author = readString(anchor),

			description = tokenizeNode([...body('.summary > .userstuff').first().children()]),

			published = readString(body, 'dd.published'),

			words = readInt(body, 'dd.words'),

			raw_chapters = readString(body, 'dd.chapters');

		let updated = readString(body, 'dd.status');
		if ( updated && ! /^\d{4}-\d{1,2}-\d{1,2}$/.test(updated) )
			updated = null;

		let author_url = anchor.attr('href');
		if ( author_url )
			author_url = new URL(author_url, ctx.url).toString();

		fragments.desc = description;
		fragments.user = author_url
			? linkToken(author_url, author, {no_color: true})
			: author;

		fragments.logo = imageToken(LOGO_URL, {aspect: 1, contain: true});

		let chapters = null;
		if (raw_chapters) {
			const idx = raw_chapters.indexOf('/');
			if ( idx !== -1 ) {
				chapters = parseInt(raw_chapters.slice(0, idx).replace(/,/g, ''), 10);
				if (Number.isNaN(chapters))
					chapters = null;
			}
		}

		const fields = [];
		const bits = [];

		if ( published !== null ) {
			fields.push({
				name: i18nToken('published', 'Published'),
				value: published,
				inline: true
			});
			if ( updated === null )
				bits.push(i18nToken('info-published', 'Published {when}', {when: published}));
		}

		if ( updated !== null ) {
			fields.push({
				name: i18nToken('updated', 'Updated'),
				value: updated,
				inline: true
			});
			bits.push(i18nToken('info-updated', 'Updated {when}', {when: updated}));
		}

		if ( chapters !== null ) {
			fields.push({
				name: i18nToken('chapters', 'Chapters'),
				value: formatToken('number', chapters),
				inline: true
			});
			bits.push(i18nToken('info-chapters', '{count,plural,one {# Chapter} other {# Chapters}}', {count: chapters}));
		}

		if ( words !== null ) {
			fields.push({
				name: i18nToken('words', 'Words'),
				value: formatToken('number', words),
				inline: true
			});
			bits.push(i18nToken('info-words', '{count,plural,one {# Word} other {# Words}}', {count: words}));
		}

		// Spooky~
		for(let i = 1; i < bits.length; i += 2)
			bits.splice(i, 0, ' • ');

		return {
			v: 6,
			i18n_prefix: 'embed.ao3',

			fragments,

			accent: '#970000',

			short: this.builder()
				.setLogo(refToken('logo'))
				.setTitle(styleToken({weight: 'regular', color: 'alt'}, i18nToken(
					'title-line',
					'{title} by {author}',
					{
						title: styleToken({weight: 'bold', color: 'base'}, title),
						author: styleToken({color: 'base'}, refToken('user'))
					}
				)))
				.setSubtitle(refToken('desc'))
				.setExtra(bits),

			full: this.builder()
				.setLogo(refToken('logo'))
				.setTitle(title)
				.setSubtitle(i18nToken(
					'by-line',
					'By {author}',
					{
						author: refToken('user')
					}
				))
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 10}, refToken('desc'))
				.addFields(...fields)
		};
	}

}

ArchiveOfOurOwn.hosts = ['archiveofourown.org'];
