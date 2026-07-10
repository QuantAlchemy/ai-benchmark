/*
 *  PackedSpriteSheetCoords.h
 *  PackedSpriteSheetCoords
 *
 *  Created by Ralph Smith on 8/23/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#ifndef __PACKED_SPRITE_SHEET_COORDS_H__
#define __PACKED_SPRITE_SHEET_COORDS_H__

#include "Engine/DataTypes.h"

namespace Advanced2D {

	#define PSWIDTH 2048
	#define PSHEIGHT 2048

	#define ASTEROIDS GRectMake(1542, PSHEIGHT-(772+475), 478, 470)
	#define GALAXIES GRectMake(2, PSHEIGHT-(772+768), 1024, 768)
	#define SHIP GRectMake(1028, PSHEIGHT-(610+71), 48, 71)
	#define EXPLOSION GRectMake(1028, PSHEIGHT-(2+606), 758, 606)
	#define ORION GRectMake(2, PSHEIGHT-(2+768), 1024, 768)
	#define PANEL GRectMake(324, PSHEIGHT-(1542+240), 640, 240)
	#define PLASMA GRectMake(2022, PSHEIGHT-(772+20), 8, 20)
	#define TIMESNEWROMAN GRectMake(1028, PSHEIGHT-(772+576), 512, 576)
	#define VERDANA GRectMake(2, PSHEIGHT-(1542+256), 320, 256)

	typedef enum {
		GALAXIES_BG=1000,
		ORION_BG,
		ASTEROID_ANIM,
		EXPLOSION_ANIM,
		SHIP_T,
		PANEL_T,
		PLASMA_T,
		TIMESNEWROMAN_F,
		VERDANA_FNT,
		
	} PackedTextureName;

	static GRect GetPackedTextureCoords (PackedTextureName name)
	{
		switch (name) {
			case GALAXIES_BG:
				return GALAXIES;
				break;
			case ORION_BG:
				return ORION;
				break;
			case ASTEROID_ANIM:
				return ASTEROIDS;
				break;
			case EXPLOSION_ANIM:
				return EXPLOSION;
				break;
			case SHIP_T:
				return SHIP;
				break;
			case PANEL_T:
				return PANEL;
				break;
			case PLASMA_T:
				return PLASMA;
				break;
			case TIMESNEWROMAN_F:
				return TIMESNEWROMAN;
				break;
			case VERDANA_FNT:
				return VERDANA;
				break;

			default:
				return GRectMake(0, 0, 0, 0);
				break;
		}
	}
	
};

#endif