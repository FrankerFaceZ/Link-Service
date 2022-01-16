'use strict';

import Resolver from '../resolver';
import {galleryToken, i18nToken, imageToken, linkToken, overlayToken} from '../builder';

const RARITY_NAMES = ['common', 'uncommon', 'rare', 'super', 'ultra', 'legendary', 'mythical', 'god', 'special', 'promo'];
const ICON_URL = 'https://lowee.de/2022-01-16_11-42-25.png';
export default class WaifuTCG extends Resolver {
	transformURL(url, ctx) {
		ctx.type = url.pathname.replace('/', '');
		ctx.tcguser = url.searchParams.get('user');
		switch (url.pathname) {

			case '/booster':
				// booster Data is highly volatile and should not be cached - Cache busting may be implemented in the link service in the future
			// eslint-disable-next-line no-fallthrough
			case '/hand':
			case '/pullfeed': {
				ctx.headers = {
					'Accept': 'application/json'
				};
				ctx.parse = 'json';
			}
			// eslint-disable-next-line no-fallthrough
			case '/':
			case '/profile': // I really thought i had implemented application/json for /profile, but I guess i did not.
			case '/rules':
			case '/discord':
			default: {
				return url.href;
			}
		}
	}

	processBody(data, mode, ctx) {
		let title = `${data.user ? data.user : ctx.tcguser}'s Waifu TCG ${ctx.type}`;
		if (ctx.type === 'pullfeed') {
			title = 'Waifu TCG Pullfeed';
		}
		const shortBuilder = this.builder()
			.setLogo(ICON_URL, {sfw: true})
			.setTitle(title);
		const fullBuilder = this.builder()
			.setLogo(ICON_URL, {sfw: true})
			.setTitle(title);
		const returnobject = {
			'v': 5,
			'accent': '#8F6AD3D8',
			'short': shortBuilder
		};
		if (data.error && data.error.status === 404) {
			shortBuilder.setSubtitle(ctx.type === 'booster' ? 'No Booster found - buy one!' : 'User not found, sorry');
		} else {
			returnobject.full = fullBuilder;
			switch (ctx.type) {
				case 'booster':
				case 'hand': {
					const len = data.cards.length;
					let subtitle = `${len} cards`;
					const rarities = Array(10).fill(0);
					const cardImages = [];
					for (const card of data.cards) {
						cardImages.push(card.image);
						rarities[card.rarity] += 1;
					}
					let currentRarity = -1;
					for (const rarity of rarities) {
						currentRarity++;
						if (rarity !== 0) {
							subtitle += `, ${rarity} ${RARITY_NAMES[currentRarity]}`;
						}
					}

					let gallery = galleryToken(...cardImages.slice(0, 4).map(image => linkToken(
						image,
						imageToken(image)
					)));

					if ( cardImages.length > 4 ) {
						gallery = overlayToken(
							gallery,
							{
								'bottom-right': i18nToken('embed.imgur.more', 'and {count,number} more', {count: cardImages.length - 4})
							}
						);
					}

					shortBuilder.setSubtitle(subtitle);
					fullBuilder.addGallery(gallery);
					fullBuilder.setSubtitle(subtitle);
				}
			}
		}
		return returnobject

	}

	processHeaders(request, ctx) {
		switch (ctx.type) {
			case '':
			default: {
				ctx.response = {
					'v': 5,
					'accent': '#8F6AD3D8',
					'short': this.builder()
						.setLogo(ICON_URL, {sfw: true})
						.setTitle('Waifu TCG')
						.setSubtitle('Collect and Trade your favourite Waifus!')
				}
				return false;
			}
			case 'booster':
			case 'hand':
			case 'pullfeed':
			case 'profile':
				return true
		}
	}

}
WaifuTCG.hosts = ['waifus.de'];
WaifuTCG.examples = [
	{
		title: 'Rules Page',
		url: 'https://waifus.de/rules'
	},
	{
		title: 'Discord Link',
		url: 'https://waifus.de/discord'
	},
	{
		title: 'Hand Page',
		url: 'https://waifus.de/hand?user=marenthyu'
	},
	{
		title: 'Booster Page',
		url: 'https://waifus.de/booster?user=marenthyu'
	}
]
