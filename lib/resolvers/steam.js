'use strict';

import dayjs from 'dayjs';
import { conditionalToken, formatToken, galleryToken, i18nToken, iconToken, imageToken, refToken } from '../builder';
import { NotFoundError } from '../errors/runtime';
import Resolver from '../resolver';
import { UseMetadata } from '../results';
import { findMatchingToken, formatSize, linkify, makeEnum, truncate } from '../utilities';

function stripBBCode(input) {
	return input.replace(/\[.+?\]/g, '');
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

	processBody(data, mode, ctx) {
		if ( ctx.mode === 'file' )
			return this.processFile(data, ctx);

		return null;
	}

	async processFile(data, ctx) {
		data = data?.response?.publishedfiledetails?.[0];
		if ( ! data )
			throw new NotFoundError;

		//console.log('data', data);

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
					formatToken('number', data.vote_data.score ?? 0, 'percent'),
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
