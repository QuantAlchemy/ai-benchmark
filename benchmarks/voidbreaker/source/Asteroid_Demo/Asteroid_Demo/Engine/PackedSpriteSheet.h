/* 
 * File:   PackedSpriteSheet.h
 * Author: ralphs
 *
 * Created on August 12, 2010, 8:30 AM
 */

#ifndef __PACKED_SPRITE_SHEET_H__
#define	__PACKED_SPRITE_SHEET_H__

#include <string>

#include "Advanced2D.h"
#include "../PackedSpriteSheetCoords.h"

namespace Advanced2D {

	class PackedSpriteSheet {
	private:
		// Packed Sprite Sheet  name
		std::string	packedSpriteSheetName;
		// Image to be used for packed sprite sheet
		Sprite	*sprite;
		// Sprite width
		GLuint	sheetWidth;
		// Sprite height
		GLuint	sheetHeight;
		// Scale of spritesheet
		float	scale;

	public:
		PackedSpriteSheet() {}
		// Selectors that allows a packed sprite sheet to be created based on the name of an image.
		PackedSpriteSheet(std::string aImageFile, TextureType aType=TGA, GLenum aFilter=GL_LINEAR);
		~PackedSpriteSheet();

		std::string getName() {return packedSpriteSheetName;}
		Sprite* getImage() {return sprite;}
		GLuint getSheetWidth() {return sheetWidth;}
		GLuint getSheetHeight() {return sheetHeight;}
		float getScale() {return scale;}
		void setScale (float s) {scale = s;}

		// Get an image from the packed sprite sheet
		Sprite* getPackedSpriteNamed (PackedTextureName aPackedTextureName);
	};
};

#endif

