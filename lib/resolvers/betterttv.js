'use strict';

import Resolver from '../resolver';
import {UseMetadata} from '../results';
import dayjs from 'dayjs';
import {i18nToken, linkToken, styleToken, galleryToken, overlayToken, formatToken, imageToken, boxToken} from '../builder';

const EMOTE_URL = /^\/emotes\/([0-9a-f]+)/i,
	LOGO_URL = 'https://cdn.frankerfacez.com/static/addons/ffzap-bttv/logo.png',
	API_SERVER = 'https://api.betterttv.net';


export default class BetterTTV extends Resolver {

	transformURL(url, ctx) {
		const match = EMOTE_URL.exec(url.pathname);
		if ( match ) {
			const emote_id = ctx.emote_id = match[1];
			ctx.cache_key = `bttv-emote-${emote_id}`;
			return `${API_SERVER}/3/emotes/${emote_id}`;
		}

		return UseMetadata;
	}

	processBody(data) {
		if ( ! data || ! data.id || ! data.live )
			return;

		const approved = data.approvalStatus === 'AUTO_APPROVED' || data.approvalStatus === 'APPROVED',
			user = linkToken(
				`https://betterttv.com/users/${data.user.id}`,
				styleToken({weight: 'semibold'}, data.user.displayName)
			),
			emote_type = data.imageType === 'gif' ?
				i18nToken('embed.bttv.animated-emote', 'Animated Emote')
				: i18nToken('embed.bttv.emote', 'Emote');

		let status = data.approvalStatus;
		if ( status === 'AUTO_APPROVED' )
			status = i18nToken('embed.bttv.status.auto', 'Auto-Approved');
		else if ( status === 'APPROVED' )
			status = i18nToken('embed.bttv.status.approved', 'Approved');

		const preview_image = boxToken({pd: 'large'},
			imageToken(
				`https://cdn.betterttv.net/emote/${data.id}/3x`,
				{sfw: approved}
			));

		const created = dayjs(data.createdAt),
			updated = dayjs(data.updatedAt);

		const logo = `${data.imageType === 'gif' ? 'https://cache.ffzap.com/' : ''}https://cdn.betterttv.net/emote/${data.id}/2x`;

		return {
			v: 5,
			accent: '#D50014',

			short: this.builder()
				.setLogo(logo, {sfw: approved, aspect: 1})
				.setSFWLogo(LOGO_URL, {sfw: true, aspect: 1})
				.setTitle(data.code)
				.setSubtitle([
					'BetterTTV ',
					emote_type,
					' • ',
					i18nToken('embed.bttv.by-line', 'By: {user}', {
						user
					})
				]),

			full: this.builder()
				.setLogo(LOGO_URL, {sfw: true, aspect: 1})
				.setTitle(data.code)
				.setSubtitle([
					emote_type,
					' • ',
					status
				])
				.addConditional(
					true, ! approved ? true : undefined,
					galleryToken([
						overlayToken(
							preview_image,
							{},
							{
								background: '#191919'
							}
						),
						overlayToken(
							preview_image,
							{},
							{
								background: '#f2f2f2'
							}
						)
					])
				)
				.addField(i18nToken('embed.bttv.uploader', 'Uploader'), user, true)
				.setFooter(null, [
					'BetterTTV',
					' • ',
					formatToken('datetime', updated || created)
				], null, {compact: true})
		}
	}

}

BetterTTV.hosts = ['betterttv.com'];
BetterTTV.examples = [
	{title: 'Home Page', url: 'https://betterttv.com/'},
	{title: 'Top Emotes', url: 'https://betterttv.com/emotes/top'},
	{title: 'Emote', url: 'https://betterttv.com/emotes/5f1b0186cf6d2144653d2970'},
	{title: 'User', url: 'https://betterttv.com/users/6058d4cf0f61826e3760bd42'}
]
