/* 
 * File:   PackedSpriteSheet.cpp
 * Author: ralphs
 *
 * Created on August 12, 2010, 8:30 AM
 */

#include "PackedSpriteSheet.h"

namespace Advanced2D {
	
	PackedSpriteSheet::PackedSpriteSheet(std::string aImageFile, TextureType aType, GLenum aFilter)
	{
		// Set the sprite sheet name
		this->packedSpriteSheetName = aImageFile;
		
		this->sheetWidth = PSWIDTH;
		this->sheetHeight = PSHEIGHT;
		this->scale = 1.0f; // currently not implementing scaling
		
		// Create sprite
		this->sprite = new Sprite();
		this->sprite->loadImage(aImageFile, TGA, aFilter);
		this->sprite->setScale(this->scale);
	}

	PackedSpriteSheet::~PackedSpriteSheet()
	{
		delete this->sprite;
	}

	Sprite* PackedSpriteSheet::getPackedSpriteNamed(PackedTextureName aPackedTextureName)
	{
		GRect rec = GetPackedTextureCoords(aPackedTextureName);
		
		Sprite* s = this->sprite->getSubSprite(rec.origin, rec.size.width, rec.size.height);
		s->setScale(this->scale);
		return s;
	}
	
};
