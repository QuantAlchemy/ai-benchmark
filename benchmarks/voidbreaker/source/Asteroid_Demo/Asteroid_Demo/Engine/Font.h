/*
 *  Font.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 8/7/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __FONT_H__
#define __FONT_H__

#define ASCII_CHAR_SET_LENGTH 256

namespace Advanced2D {
	
	class Font : public Sprite {
	private:
		int widths[ASCII_CHAR_SET_LENGTH];
		
	public:
		Font();
		virtual ~Font(void) { }
		
		void Print(int x, int y, std::string text, Color4f color = ColorNull());
		
		int getCharWidth() { return this->width; }
		int getCharHeight() { return this->height; }
		void setCharWidth(int width) { this->width = width;	}
		void setCharSize(int width, int height) {
			setCharWidth( width );
			this->height = height;
		}
		
		bool loadWidthData(std::string filename);
	};
	
};

#endif