/*
 *  Sprite.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 8/3/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include <stdlib.h>

#include "Advanced2D.h"
#include "transforms.h"

namespace Advanced2D {

	Sprite::Sprite() : Entity(RENDER2D)
	{
		this->initialized = false;
		this->image = NULL;
		this->imageLoaded = false;
		this->setPosition(0.0f,0.0f);
		this->setVelocity(0.0f,0.0f);
		this->state = 0;
		this->direction = 0;
		this->width = 1;
		this->height = 1;
		this->curframe = 0;
		this->totalframes = 1;
		this->animdir = 1;
		this->animcolumns = 1;
		this->framestart = 0;
		this->frametimer = 0;
		this->animcolumns = 1;
		this->animstartx = 0;
		this->animstarty = 0;
		this->faceAngle = 0;
		this->moveAngle = 0;
		this->rotation = 0;
		this->scaling = 1.0f;
		this->color.red = 1.0;
		this->color.green = 1.0;
		this->color.blue = 1.0;
		this->color.alpha = 1.0;
		this->movetimer = 16;
		this->movestart = 0;
		this->collidable = true;
		this->collisionMethod = COLLISION_RECT;
		this->lastTextureOffset = GPointMake(-65535, -65535); // -- abitrarily large values so that texture coordinates will be calculated
		this->textureOffset = GPointMake(0.0, 0.0);
		
		this->init();
	}
	
	Sprite::~Sprite()
	{
		if (imageLoaded) {
			// we are using a resource manager to cache texutures so we will not be deleting on an idividual texture basis
			//delete image;
			//sharedResourceManager.releaseTextureWithName(this->image->name());
			free(textureCoordinates);
			free(vertices);
			free(indices);
			free(transformedVerts);
		}
	}
	
	void Sprite::init()
	{
		// Init texture and vertex arrays
		int totalQuads = 1;
		textureCoordinates = (Quad2f*)calloc( totalQuads, sizeof( Quad2f ) );
		vertices = (Quad2f*)calloc( totalQuads, sizeof( Quad2f ) );
		transformedVerts = (Quad2f*)calloc( totalQuads, sizeof( Quad2f ) );
		indices = (GLushort*)calloc( totalQuads * 6, sizeof( GLushort ) );
		
 		for (int i=0; i<totalQuads; i++) {
			indices[i*6+0] = i*4+0;
			indices[i*6+1] = i*4+1;
			indices[i*6+2] = i*4+2;
			indices[i*6+5] = i*4+1;
			indices[i*6+4] = i*4+2;
			indices[i*6+3] = i*4+3;
		}
		
		this->initialized = true;
	}
	
	bool Sprite::loadImage(std::string filename, TextureType type, GLenum filter)
	{
		if (!this->initialized) {
			printf("Sprite has not been created yet ... initialized\n");
			return false;
		}
		
		if (this->image = sharedResourceManager.getTextureWithName(filename, type, filter))
		{
			this->setSize(image->getWidth(),image->getHeight());
			this->imageLoaded = true;
			this->texWidthRatio = 1.0/image->getWidth();
			this->texHeightRatio = 1.0/image->getHeight();
			
			return true;
		}
		else
			return false;
	}
	
	Sprite* Sprite::getSubSprite(GPoint aPoint, int subWidth, int subHeight)
	{
		Sprite* s = new Sprite;
		s->setImage(this->image);
		s->setWidth(subWidth);
		s->setHeight(subHeight);
		s->setTextureOffset(aPoint.x, aPoint.y);
		return s;
	}
	
	void Sprite::setImage(Texture *image)
	{
		this->image = image;
		this->setWidth(image->getWidth());
		this->setHeight(image->getHeight());
		this->imageLoaded = false;
		this->texWidthRatio = 1.0/image->getWidth();
		this->texHeightRatio = 1.0/image->getHeight();
	}
		
	void Sprite::draw(bool aCenter)
	{
		int fx = (this->curframe % this->animcolumns) * this->width;
		int fy = (((this->totalframes-1) - this->curframe) / this->animcolumns) * this->height;
		
		// -- add textureOffset to frame coordinates to work with the packed sprite sheet (sub sprite images)
		fx += this->textureOffset.x;
		fy += this->textureOffset.y;

		calculateVerticesAtPoint(GPointMake(this->position.x, this->position.y), this->width, this->height, aCenter);
		calculateTexCoordsAtOffset(GPointMake(fx, fy), this->width, this->height);
		
		// -- rotate vertices
		// -- methods from transforms.h file
		float mat[9];
		loadIdentityMatrix(mat);
		rotateMatrix(mat, GPointMake(this->position.x, this->position.y), -this->rotation);
		transformMatrix(mat, this->vertices, this->transformedVerts);
		
		colorfilter[0][0] = this->color.red;
		colorfilter[0][1] = this->color.green;
		colorfilter[0][2] = this->color.blue;
		colorfilter[0][3] = this->color.alpha;
		colorfilter[1][0] = this->color.red;
		colorfilter[1][1] = this->color.green;
		colorfilter[1][2] = this->color.blue;
		colorfilter[1][3] = this->color.alpha;
		colorfilter[2][0] = this->color.red;
		colorfilter[2][1] = this->color.green;
		colorfilter[2][2] = this->color.blue;
		colorfilter[2][3] = this->color.alpha;
		colorfilter[3][0] = this->color.red;
		colorfilter[3][1] = this->color.green;
		colorfilter[3][2] = this->color.blue;
		colorfilter[3][3] = this->color.alpha;
		
		// -- Adds a sprite to the list of batched sprites
//		sharedSpriteBatcher.addData(this->vertices, this->textureCoordinates, this->image->name(), this->colorfilter);
		sharedSpriteBatcher.addData(this->transformedVerts, this->textureCoordinates, this->image->name(), this->colorfilter);
	}
	
	void Sprite::calculateVerticesAtPoint (GPoint aPoint, GLuint aSubImageWidth, GLuint aSubImageHeight, bool aCenter)
	{
		// Calculate the width and the height of the quad using the current image scale and the width and height
		// of the image we are going to render
		double quadWidth = aSubImageWidth * scaling;
		double quadHeight = aSubImageHeight * scaling;
		
		// Define the vertices for each corner of the quad which is going to contain our image.
		// We calculate the size of the quad to match the size of the subimage which has been defined.
		// If center is true, then make sure the point provided is in the center of the image else it will be
		// the bottom left hand corner of the image
		if(aCenter) {
			vertices[0].bl_x = aPoint.x + -quadWidth / 2;
			vertices[0].bl_y = aPoint.y + -quadHeight / 2;
			
			vertices[0].br_x = aPoint.x + quadWidth / 2;
			vertices[0].br_y = aPoint.y + -quadHeight / 2;
			
			vertices[0].tl_x = aPoint.x + -quadWidth / 2;
			vertices[0].tl_y = aPoint.y + quadHeight / 2;
			
			vertices[0].tr_x = aPoint.x + quadWidth / 2;
			vertices[0].tr_y = aPoint.y + quadHeight / 2;
		} else {
			vertices[0].bl_x = vertices[0].br_x = vertices[0].tl_x = vertices[0].tr_x = aPoint.x;
			vertices[0].bl_y = aPoint.y;
			vertices[0].bl_y = vertices[0].br_y = vertices[0].tl_y = vertices[0].tr_y = aPoint.y;
			
			vertices[0].br_x += quadWidth;
			
			vertices[0].tl_y += quadHeight;
			
			vertices[0].tr_x += quadWidth;
			vertices[0].tr_y += quadHeight;
		}
	}
	
	void Sprite::calculateTexCoordsAtOffset (GPoint aOffsetPoint, int aSubImageWidth, int aSubImageHeight)
	{
		// Calculate the texture coordinates using the offset point from which to start the image and then 
		// using the width and height passed in.  We only calculate the texture coordinates once for an image 
		// to help performance.
		
		if(aOffsetPoint.x != lastTextureOffset.x || aOffsetPoint.y != lastTextureOffset.y) {
			lastTextureOffset = aOffsetPoint;
			
			// Work out the texture coordinates 
			Quad2f tempTexCoords;
			tempTexCoords.tl_x = texWidthRatio * aOffsetPoint.x;
			tempTexCoords.tl_y = texHeightRatio * aOffsetPoint.y;
			tempTexCoords.tr_x = texWidthRatio * aSubImageWidth + (texWidthRatio * aOffsetPoint.x);
			tempTexCoords.tr_y = texHeightRatio * aOffsetPoint.y;
			tempTexCoords.bl_x = texWidthRatio * aOffsetPoint.x;
			tempTexCoords.bl_y = texHeightRatio * aSubImageHeight + (texHeightRatio * aOffsetPoint.y);
			tempTexCoords.br_x = texWidthRatio * aSubImageWidth + (texWidthRatio * aOffsetPoint.x);
			tempTexCoords.br_y = texHeightRatio * aSubImageHeight + (texHeightRatio * aOffsetPoint.y);
			
			// Load the texture coordinates into |texCoords| as necessary.  Swapping which values are
			// loaded into |texCoords| allows us to flip the texture.
//			if(!flipHorizontally && !flipVertically) {
//				textureCoordinates[0].tl_x = tempTexCoords.tl_x;
//				textureCoordinates[0].tl_y = tempTexCoords.tl_y;
//				textureCoordinates[0].tr_x = tempTexCoords.tr_x;
//				textureCoordinates[0].tr_y = tempTexCoords.tr_y;
//				textureCoordinates[0].bl_x = tempTexCoords.bl_x;
//				textureCoordinates[0].bl_y = tempTexCoords.bl_y;
//				textureCoordinates[0].br_x = tempTexCoords.br_x;
//				textureCoordinates[0].br_y = tempTexCoords.br_y;
//				return;
//			}
//			
//			if(flipVertically && flipHorizontally) {
//				textureCoordinates[0].br_x = tempTexCoords.tl_x;
//				textureCoordinates[0].br_y = tempTexCoords.tl_y;
//				textureCoordinates[0].bl_x = tempTexCoords.tr_x;
//				textureCoordinates[0].bl_y = tempTexCoords.tr_y;
//				textureCoordinates[0].tr_x = tempTexCoords.bl_x;
//				textureCoordinates[0].tr_y = tempTexCoords.bl_y;
//				textureCoordinates[0].tl_x = tempTexCoords.br_x;
//				textureCoordinates[0].tl_y = tempTexCoords.br_y;
//				return;
//			}
//			
//			if(flipHorizontally) {
				textureCoordinates[0].br_x = tempTexCoords.tr_x;
				textureCoordinates[0].br_y = tempTexCoords.tr_y;
				textureCoordinates[0].tr_x = tempTexCoords.br_x;
				textureCoordinates[0].tr_y = tempTexCoords.br_y;
				textureCoordinates[0].bl_x = tempTexCoords.tl_x;
				textureCoordinates[0].bl_y = tempTexCoords.tl_y;
				textureCoordinates[0].tl_x = tempTexCoords.bl_x;
				textureCoordinates[0].tl_y = tempTexCoords.bl_y;
				return;
//			}
//			
//			if(flipVertically) {
//				textureCoordinates[0].tr_x = tempTexCoords.tl_x;
//				textureCoordinates[0].tr_y = tempTexCoords.tl_y;
//				textureCoordinates[0].tl_x = tempTexCoords.tr_x;
//				textureCoordinates[0].tl_y = tempTexCoords.tr_y;
//				textureCoordinates[0].br_x = tempTexCoords.bl_x;
//				textureCoordinates[0].br_y = tempTexCoords.bl_y;
//				textureCoordinates[0].bl_x = tempTexCoords.br_x;
//				textureCoordinates[0].bl_y = tempTexCoords.br_y;
//				return;
//			}
//			
//			if(flipVertically && flipHorizontally) {
//				textureCoordinates[0].bl_x = tempTexCoords.tl_x;
//				textureCoordinates[0].bl_y = tempTexCoords.tl_y;
//				textureCoordinates[0].br_x = tempTexCoords.tr_x;
//				textureCoordinates[0].br_y = tempTexCoords.tr_y;
//				textureCoordinates[0].tl_x = tempTexCoords.bl_x;
//				textureCoordinates[0].tl_y = tempTexCoords.bl_y;
//				textureCoordinates[0].tr_x = tempTexCoords.br_x;
//				textureCoordinates[0].tr_y = tempTexCoords.br_y;
//				return;
//			}
		}
	}

	void Sprite::move()
	{
		if (movetimer > 0) {
			if (Timer::GetTimeMs() > (double)(movestart + movetimer)) {
				//reset move timer
				movestart = Timer::GetTimeMs();

				//move sprite by velocity amount
				this->setX(this->getX() + this->velocity.getX());
				this->setY(this->getY() + this->velocity.getY());
			}
		}
		else {
			//no movement timer--update at cpu clock speed
			this->setX(this->getX() + this->velocity.getX());
			this->setY(this->getY() + this->velocity.getY());
		}
	}


	void Sprite::animate() 
	{
		//update frame based on animdir
		if (frametimer > 0) {
			if (Timer::GetTimeMs() > (double)(framestart + frametimer))  {				
				//reset animation timer
				framestart = Timer::GetTimeMs();
				curframe += animdir;

				//keep frame within bounds	
				if (curframe < 0) curframe = totalframes-1;
				if (curframe > totalframes-1) curframe = 0;
			}
		}
		else {
			//no animation timer--update at cpu clock speed
			curframe += animdir;
			if (curframe < 0) curframe = totalframes-1;
			if (curframe > totalframes-1) curframe = 0;
		}
	}

	Rect Sprite::getBounds()
	{
		Rect rect;
		rect.left = getX();
		rect.top = getY();
		rect.right = getX() + getWidth() * getScale();
		rect.bottom = getY() + getHeight() * getScale();
		return rect;
	}

}
