/*
 *  SpriteBatch.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/25/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

// malloc and bzero and free
#include <stdlib.h>
#include <string.h>

#if __IPHONE_OS_VERSION_MIN_REQUIRED
#include <OpenGLES/ES1/gl.h>
#include <OpenGLES/ES1/glext.h>
#elif __APPLE__ 
#include <OpenGL/OpenGL.h>
#elif _WIN32
#include <GL/GLee.h>
#pragma comment( lib, "GLee.lib" )
#define bzero(p, size) (void)memset((p), 0, (size))
#else
#define GL_GLEXT_PROTOTYPES
#include <GL/gl.h>
#include <GL/glu.h>
#include <GL/glext.h>
#endif

#include "SpriteBatch.h"

namespace Advanced2D {
	
	SpriteBatch::SpriteBatch() {
		vertices = (Quad2f*)malloc( sizeof(vertices[0]) * MAX_QUADS);
		bzero( vertices, sizeof(vertices[0]) * MAX_QUADS);
		
		texCoords = (Quad2f*)malloc( sizeof(texCoords[0]) * MAX_QUADS);
		bzero( texCoords, sizeof(texCoords[0]) * MAX_QUADS);
		
		glGenBuffers(1, &vertexBuffer);
		glGenBuffers(1, &indexBuffer);
		glGenBuffers(1, &colorBuffer);
		glGenBuffers(1, &texCoordBuffer);		
	}
	
	
	SpriteBatch::~SpriteBatch() {
		free(vertices);
		free(texCoords);
		glDeleteBuffers(1, &vertexBuffer);
		glDeleteBuffers(1, &indexBuffer);
		glDeleteBuffers(1, &colorBuffer);
		glDeleteBuffers(1, &texCoordBuffer);
	}		
	
	void SpriteBatch::end() {
		this->draw();
	}
	
	
	void SpriteBatch::addData (Quad2f* verts, Quad2f* texs, GLuint tex, GLfloat filter[4][4]) {
	
		vertices[currentQuad] = verts[0];
		texCoords[currentQuad] = texs[0];
		texture = tex;
		for(int i=0;i<4;i++) {
			for(int ii=0;ii<4;ii++) {
				blend[currentQuad][i][ii] = filter[i][ii];
			}
		}
		currentQuad++;		
	}

	
	void SpriteBatch::draw() {
		
		indices = (GLshort*)malloc( sizeof(indices[0]) * currentQuad * 6);
		bzero( indices, sizeof(indices[0]) * currentQuad * 6);
		
		for(int i=0;i<currentQuad;i++) {
			indices[i*6+0] = i*4+0;
			indices[i*6+1] = i*4+1;
			indices[i*6+2] = i*4+2;
			indices[i*6+5] = i*4+1;
			indices[i*6+4] = i*4+2;
			indices[i*6+3] = i*4+3;
		}
		
		glPushMatrix();
		
		glEnable(GL_BLEND);
		glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
		glEnableClientState(GL_COLOR_ARRAY);
		glEnableClientState(GL_VERTEX_ARRAY);
		glEnableClientState(GL_TEXTURE_COORD_ARRAY);
		glEnable(GL_TEXTURE_2D);
		
//		glBindTexture(GL_TEXTURE_2D, this->texture);
		if (this->texture != sharedResourceManager.getCurrentlyBoundTexture()) {
//			printf("change currently bound texture %d\n", this->texture);
			sharedResourceManager.setCurrentlyBoundTexture(this->texture);
			glBindTexture(GL_TEXTURE_2D, this->texture);
		}
		
		glBindBuffer(GL_ARRAY_BUFFER, vertexBuffer);
		glBufferData(GL_ARRAY_BUFFER, sizeof(GLfloat) * 2 * 4 * currentQuad, vertices, GL_DYNAMIC_DRAW);
		glVertexPointer(2, GL_FLOAT, 0, 0);
		glBindBuffer(GL_ARRAY_BUFFER, 0);
		
		glBindBuffer(GL_ARRAY_BUFFER, texCoordBuffer);
		glBufferData(GL_ARRAY_BUFFER, sizeof(GLfloat) * 2 * 4 * currentQuad, texCoords, GL_DYNAMIC_DRAW);
		glTexCoordPointer(2, GL_FLOAT, 0, 0);
		glBindBuffer(GL_ARRAY_BUFFER, 0);
		
		glBindBuffer(GL_ARRAY_BUFFER, colorBuffer);
		glBufferData(GL_ARRAY_BUFFER, sizeof(GLfloat) * 4 * 4 * currentQuad, blend, GL_DYNAMIC_DRAW);
		glColorPointer(4, GL_FLOAT, 0, 0);
		glBindBuffer(GL_ARRAY_BUFFER, 0);

		glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, indexBuffer);
		glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(GLushort) * currentQuad * 6, indices, GL_DYNAMIC_DRAW);
		glDrawElements(GL_TRIANGLES, currentQuad*6, GL_UNSIGNED_SHORT, 0);
		glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, 0);
		
		glDisable(GL_BLEND);
		glDisable(GL_TEXTURE_2D);
		glDisableClientState(GL_COLOR_ARRAY);
		glDisableClientState(GL_TEXTURE_COORD_ARRAY);
		glDisableClientState(GL_VERTEX_ARRAY);
		
		glPopMatrix();
		
		free(indices);
		currentQuad = 0;		
	}
}
