'use strict';

import dayjs from 'dayjs';
import { boxToken, conditionalToken, formatToken, galleryToken, i18nToken, iconToken, imageToken, linkToken, overlayToken, refToken, styleToken } from '../builder';
import { NotFoundError } from '../errors/runtime';
import Resolver from '../resolver';
import { UseMetadata } from '../results';
import { findMatchingToken, formatSize, linkify, makeEnum, parseHTML, tokenizeNode, truncate } from '../utilities';

function stripBBCode(input) {
	return input ? input.replace(/\[.+?\]/g, '') : null;
}

const WorkshopType = makeEnum(
	'Standard',
	'Microtransaction',
	'Collection',
	'Art',
	'Video',
	'Screenshot',
	'UNUSED_Game',
	'UNUSED_Software',
	'UNUSED_Concept',
	'WebGuide',
	'IntegratedGuide',
	'Merch',
	'ControllerBinding',
	'INTERNAL_SteamworksAccessInvite',
	'SteamVideo',
	'NOTSHOWN_GameManagedItem',
);

const ContentDescriptor = {
	SomeNudityOrSexualContent: 1,
	FrequentViolenceOrGore: 2,
	AdultOnlySexualContent: 3,
	FrequentNudityOrSexualContent: 4,
	GeneralMatureContent: 5,
};

const SAFE_CONTENT_DESCRIPTORS = [
	ContentDescriptor.FrequentViolenceOrGore,
	ContentDescriptor.GeneralMatureContent
];


const APP_MATCHER = /^\/app\/(\d+)(?:\/|$)/;


export default class Steam extends Resolver {

	constructor(service) {
		super(service);
		this.opts = service.opts.steam_api;
		if ( ! this.opts?.key )
			this.opts = null;
	}

	transformURL(url, ctx) {
		if ( ! this.opts )
			return UseMetadata;

		if ( url.hostname === 'steamcommunity.com' )
			return this.transformCommunityURL(url, ctx);

		if ( url.hostname === 'store.steampowered.com' )
			return this.transformStoreURL(url, ctx);

		return UseMetadata;
	}

	transformStoreURL(url, ctx) {
		let match = APP_MATCHER.exec(url.pathname);
		if ( match ) {
			const id = ctx.app_id = match[1];
			ctx.cache_key = `steam-app-${id}`;
			ctx.mode = 'app';

			const out = new URL('https://store.steampowered.com/api/appdetails');
			out.searchParams.append('appids', id);
			out.searchParams.append('currency', 'USD');
			out.searchParams.append('cc', 'us');
			out.searchParams.append('l', 'en');

			return out;
		}

		return UseMetadata;
	}

	transformCommunityURL(url, ctx) {
		if ( url.pathname === '/sharedfiles/filedetails/' ) {
			const id = url.searchParams.get('id');
			if ( id ) {
				ctx.cache_key = `steam-file-${id}`;
				ctx.mode = 'file';

				const out = new URL('https://api.steampowered.com/IPublishedFileService/GetDetails/v1/');
				out.searchParams.append('key', this.opts.key);
				out.searchParams.append('publishedfileids[0]', id);
				out.searchParams.append('includetags', 'true');
				out.searchParams.append('includeadditionalpreviews', 'true');
				out.searchParams.append('includevotes', 'true');
				//out.searchParams.append('strip_description_bbcode', 'true');

				return out;
			}
		}

		return UseMetadata;
	}

	async fetchReviewScore(app_id) {
		const url = new URL(`https://store.steampowered.com/appreviews/${app_id}`);
		url.searchParams.append('json', 1);
		url.searchParams.append('day_range', 7);
		url.searchParams.append('language', 'all');
		url.searchParams.append('num_per_page', 0);

		let data;
		try {
			data = await this.fetch(url)
				.then(resp => resp.ok ? resp.json() : null)
				.catch(() => null)
		} catch(err) {
			/* no-op */
		}

		if ( ! data?.success || data.query_summary?.total_reviews == null )
			return null;

		return {
			total: data.query_summary.total_reviews ?? 0,
			positive: data.query_summary.total_positive ?? 0,
			negative: data.query_summary.total_negative ?? 0,
			score: data.query_summary.review_score ?? 0,
			description: data.query_summary.review_score_desc
		};
	}

	processBody(data, mode, ctx) {
		if ( ctx.mode === 'file' )
			return this.processFile(data, ctx);

		if ( ctx.mode === 'app' )
			return this.processApp(data, ctx);

		return null;
	}

	async processApp(data, ctx) {
		data = data?.[ctx.app_id];
		if ( ! data?.success || ! data.data )
			return UseMetadata;
		data = data.data;

		//console.log('data', data);

		const reviews = await this.fetchReviewScore(ctx.app_id);
		//console.log('reviews', reviews);

		const content_ids = data.content_descriptors?.ids ?? [];
		const nsfw = content_ids.filter(id => ! SAFE_CONTENT_DESCRIPTORS.includes(id)).length;

		const logo = data.header_image ?? data.capsule_image ?? data.capsule_imagev5;

		const fragments = {
			logo: imageToken(logo),
			desc: tokenizeNode(parseHTML(data.short_description))
		};

		let media = [];

		if ( data.movies?.[0] ) {
			const movie = data.movies[0],
				sources = [];

			if ( movie.webm?.max )
				sources.push({
					type: 'video/webm',
					src: movie.webm.max
				});

			if ( movie.mp4?.max )
				sources.push({
					type: 'video/mp4',
					src: movie.mp4.max
				});

			if ( sources.length )
				media.push({
					type: 'player',
					sources,
					content: overlayToken(
						imageToken(
							movie.thumbnail,
							{
								alt: movie.name
							}
						),
						{
							center: styleToken({size: '2'}, iconToken('play'))
						}
					)
				});
		}

		if ( Array.isArray(data.screenshots) )
			for(const image of data.screenshots) {
				media.push(linkToken(
					image.path_full,
					imageToken(
						image.path_thumbnail
					)
				));

				if ( media.length >= 4 )
					break;
			}


		media = media.length
			? conditionalToken(true, nsfw ?? undefined, galleryToken(...media))
			: null;

		return {
			v: 9,
			accent: '#171a21',
			i18n_prefix: 'embed.steam',

			fragments,

			short: this.builder()
				.setLogo(refToken('logo'))
				.setTitle(data.name)
				.setSubtitle(refToken('desc'))
				.setExtra([
					iconToken('steam')
				]),

			full: this.builder()
				.setLogo(refToken('logo'))
				.setTitle(data.name)
				.setSubtitle(data.developers)
				.setFooter(null, [
					iconToken('steam')
				])
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: 10}, refToken('desc'))
				.add(media)
				.addField(i18nToken('price', 'Price'), data.price_overview?.final_formatted, true)
				.addField(i18nToken('metacritic', 'Metacritic Score'), data.metacritic
					? boxToken({'mg-y': 'tiny'}, linkToken(data.metacritic.url,
						styleToken({
							'pd': 'tiny',
							background: '#66CC33',
							color: '#FFF'
						}, data.metacritic.score)
					))
					: null
				, true)
				.addField(i18nToken('genre', 'Genre'), data.genres.map(genre => genre.description).join(', '), true)
				.addField(i18nToken('user-reviews', 'User Reviews'), [
					reviews.description, styleToken({color: 'alt-2'}, [
						' (',
						i18nToken('review-breakdown', '{positive, number, percent} of {count, plural, one {# review} other {# reviews}}', {
							positive: reviews.positive / reviews.total,
							count: reviews.total
						}),
						')'
					])
				])

		};
	}


	async processFile(data, ctx) {
		data = data?.response?.publishedfiledetails?.[0];
		if ( ! data || data.file_type == null )
			throw new NotFoundError;

		const is_collection = data.file_type === WorkshopType.Collection,
			is_art = data.file_type === WorkshopType.Art || data.file_type === WorkshopType.Screenshot;

		let type;
		if ( data.file_type === WorkshopType.Collection )
			type = i18nToken('t-collection', 'Collection');
		else if ( data.file_type === WorkshopType.Art )
			type = i18nToken('t-art', 'Art');
		else if ( data.file_type === WorkshopType.Video || data.file_type === WorkshopType.SteamVideo )
			type = i18nToken('t-video', 'Video');
		else if ( data.file_type === WorkshopType.Screenshot )
			type = i18nToken('t-screenshot', 'Screenshot');
		else if ( data.file_type === WorkshopType.WebGuide || data.file_type === WorkshopType.IntegratedGuide )
			type = i18nToken('t-guide', 'Guide');
		else if ( data.file_type === WorkshopType.Merch )
			type = i18nToken('t-merch', 'Merch');
		else if ( data.file_type === WorkshopType.ControllerBinding )
			type = i18nToken('t-binding', 'Controller Layout');

		const fragments = {
			title: data.title,
			desc: linkify(truncate(stripBBCode(data.file_description), 1000, undefined, undefined, false)),
			extra: [
				iconToken('steam'),
				i18nToken('workshop', 'Workshop'),
				' • ',
				type ? [
					type,
					' • '
				] : null,
				data.app_name
			]
		};

		const posted = dayjs(data.time_created * 1000),
			updated = data.time_updated && data.time_updated !== data.time_created
				? dayjs(data.time_updated * 1000)
				: null,

			posted_old = dayjs() - posted > 86_400_000,
			updated_old = updated && (dayjs() - updated > 86_400_000);

		const nsfw = data.maybe_inappropriate_sex || data.maybe_inappropriate_violence;

		let raw_media = data.previews,
			media = [];

		if ( data.image_url )
			media.push(imageToken(data.image_url));

		if ( raw_media?.length > 0 ) {
			// Sort things first. For some reason, the API result isn't
			// sorted the same as the website.
			raw_media.sort((a, b) => {
				const a_vid = a.preview_type === 1,
					b_vid = b.preview_type === 1;

				if ( a_vid && ! b_vid )
					return -1;
				if ( b_vid && ! a_vid )
					return 1;

				return (a.sortorder ?? 0) - (b.sortorder ?? 0);
			});

			media = [];

			for(const entity of raw_media) {
				const type = entity.preview_type;

				if ( type === 0 && entity.url ) {
					media.push(imageToken(entity.url));
				}

				else if ( type === 1 && entity.youtubevideoid ) {
					// We only have a video ID.
					// We can't display a thumbnail with that.

					const ytr = this.service.getResolver('YouTube');
					if ( ytr )
						try {
							const url = new URL(`https://www.youtube.com/watch`);
							url.searchParams.append('v', entity.youtubevideoid);

							const result = await ytr._run(url, ctx.url, ctx.cookies, ctx.hsts);
							const player = findMatchingToken(result?.full, n => n.type === 'player');

							if ( player ) {
								const rtoken = findMatchingToken(player, n => n.type === 'ref' && n.name === 'thumb');
								if ( rtoken )
									Object.assign(rtoken, result.fragments.thumb);

								media.push(player);
							}

						} catch(err) {
							console.error(err);
						}
				}

				if ( media.length >= 4 )
					break;
			}
		}

		media = media.length > 0
			? conditionalToken(true, nsfw ? true : undefined, galleryToken(...media))
			: null;

		return {
			v: 9,
			accent: '#171a21',
			i18n_prefix: 'embed.steam',

			fragments,

			short: this.builder()
				.setTitle(refToken('title'))
				.setSubtitle(refToken('desc'))
				.setExtra([
					refToken('extra'),
					' • ',
					updated
						? i18nToken('updated', 'Updated {when}', {
							when: formatToken(updated_old ? 'date' : 'time', updated)
						})
						: i18nToken('posted', 'Posted {when}', {
							when: formatToken(posted_old ? 'date' : 'time', posted)
						})
				])
				.setLogo(data.preview_url, {sfw: nsfw ? false : undefined}),

			full: this.builder()
				.setTitle(refToken('title'))
				//.setExtra(refToken('extra'))
				.setLogo(data.preview_url, {sfw: nsfw ? false : undefined})
				.setFooter(null, [
					refToken('extra')
				])
				.addBox({'mg-y': 'small', wrap: 'pre-wrap', lines: media ? 5 : 10}, refToken('desc'))
				.add(media)
				.addField(
					i18nToken('tags', 'Tags'),
					data.tags?.length
						? truncate(data.tags.slice(0,4).map(tag => tag.display_name ?? tag.tag).join(', '))
						: null,
					true
				)
				.addField(
					i18nToken('score', 'Score'),
					formatToken('number', data.vote_data?.score ?? 0, 'percent'),
					true
				)
				.addField(
					i18nToken('items', 'Collection Items'),
					is_collection ? formatToken('number', data.num_children) : null,
					true
				)
				.addField(
					i18nToken('size', 'File Size'),
					formatSize(data.file_size, true),
					true
				)
				.addField(
					i18nToken('views', 'Views'),
					data.views > 0
						? formatToken('number', data.views)
						: null,
					true
				)
				.addField(
					i18nToken('subs', 'Subscribers'),
					data.subscriptions > 0
						? formatToken('number', data.subscriptions)
						: null,
					true
				)
				.addField(
					i18nToken('favs', 'Favorites'),
					data.favorited > 0
						? formatToken('number', data.favorited)
						: null,
					true
				)
				.addField(
					i18nToken('f-posted', 'Posted'),
					formatToken('datetime', posted),
					true
				)
				.addField(
					i18nToken('f-updated', 'Updated'),
					updated ? formatToken('datetime', updated) : null,
					true
				)
		};
	}

}

Steam.hosts = [
	'store.steampowered.com',
	'steamcommunity.com'
];

Steam.examples = [

];
