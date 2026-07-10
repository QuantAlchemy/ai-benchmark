/*
 *  ResourceManager.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/23/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Advanced2D.h"

#ifndef __RESOURCE_MANAGER_H__
#define __RESOURCE_MANAGER_H__

#include <map>
#include <string>


namespace Advanced2D {

	class ResourceManger
	{

	// Class that is responsible for texture resources witihn the game.  This class should be
	// used to load any texture.  The class will check to see if an instance of that Texture
	// already exists and will return a reference to it if it does.  If not instance already
	// exists then it will create a new instance and pass a reference back to this new instance.
	// The filename of the texture is used as the key within this class.
		
	private:
		
		// Currently bound texture name
		GLuint currentlyBoundTexture;
		
		std::map<std::string, Texture*> _cachedTextures;
		std::map<std::string, Texture*>::iterator _it;
		
	protected:
		ResourceManger (void) {}
		ResourceManger (const ResourceManger&) {}
		ResourceManger& operator= (const ResourceManger&) {return *this;}
		~ResourceManger() {}
		
	public:
		
		static inline ResourceManger& sharedResourceManager()
		{
			static ResourceManger inst;
			return inst;
		}
		
		GLuint getCurrentlyBoundTexture() {return currentlyBoundTexture;}
		void setCurrentlyBoundTexture (GLuint tex) {currentlyBoundTexture = tex;}

		//// Selector returns a Texture2D which has a key of |aTextureName|.  If a texture cannot be
		//// found with that key then a new Texture2D is created and added to the cache and a 
		//// reference to this new Texture2D instance is returned.
		Texture* getTextureWithName (std::string aTextureName, TextureType type=TGA, GLenum filter=GL_LINEAR);

		//// Selector that releases a cached texture which has a matching key to |aTextureName|.
		bool releaseTextureWithName (std::string aTextureName);

		//// Selector that releases all cached textures.
		void releaseAllTextures ();
	};

	#define sharedResourceManager ResourceManger::sharedResourceManager()
	
};

#endif