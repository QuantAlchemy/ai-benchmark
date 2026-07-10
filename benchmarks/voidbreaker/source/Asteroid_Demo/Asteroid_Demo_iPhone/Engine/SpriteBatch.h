/*
 *  SpriteBatch.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/25/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __SPRITE_BATCH_H__
#define __SPRITE_BATCH_H__

# define MAX_QUADS 2048

namespace Advanced2D {
	
	class SpriteBatch
	{
		
		// Class that is responsible for batch rendering sprites
		
	private:
		Quad2f*		vertices;
		Quad2f*		texCoords;
		GLuint		texture;
		int			currentQuad;
		GLfloat		blend[MAX_QUADS][4][4];
		GLshort*	indices;
		GLuint		vertexBuffer;
		GLuint		indexBuffer;
		GLuint		colorBuffer;
		GLuint		texCoordBuffer;
		
		void draw();
		
	protected:
		SpriteBatch (void);
		SpriteBatch (const SpriteBatch&) {}
		SpriteBatch& operator= (const SpriteBatch&) {return *this;}
		~SpriteBatch();
		
	public:
		
		static inline SpriteBatch& sharedSpriteBatcher()
		{
			static SpriteBatch inst;
			return inst;
		}
		
		void end();
		void addData (Quad2f* verts, Quad2f* texs, GLuint tex, GLfloat filter[4][4]);
		
	};
	
#define sharedSpriteBatcher SpriteBatch::sharedSpriteBatcher()
	
};

#endif
