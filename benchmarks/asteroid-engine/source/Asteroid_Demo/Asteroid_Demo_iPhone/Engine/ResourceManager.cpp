/*
 *  ResourceManager.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/23/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "ResourceManager.h"

namespace Advanced2D {

	Texture* ResourceManger::getTextureWithName (std::string aTextureName, TextureType type, GLenum filter)
	{
		// Try to get a texture from cachedTextures with the supplied key.
		Texture* cachedTexture;
		
		// If we can find a texture with the supplied key then return it.
		if ((_it = _cachedTextures.find(aTextureName)) != _cachedTextures.end()) {
			if(DEBUG) std::cout << "INFO - Resource Manager: A cached texture was found with the key " << aTextureName << std::endl;
			return _it->second;
		}
						
		// As no texture was found we create a new one, cache it and return it.
		if(DEBUG) std::cout << "INFO - Resource Manager: A texture with the key " << aTextureName << " could not be found so creating it.\n";
		cachedTexture = new Texture(aTextureName, type, filter);
		_cachedTextures.insert (std::map<std::string, Texture*>::value_type(aTextureName, cachedTexture));
		return cachedTexture;
	}


	bool ResourceManger::releaseTextureWithName (std::string aTextureName)
	{
		// If a texture was found we can remove it from the cachedTextures and return YES.
		if(_cachedTextures.find(aTextureName) != _cachedTextures.end()) {
			if(DEBUG) std::cout << "INFO - Resource Manager: A cached texture with the key " << aTextureName << " was released.\n";
			// map calls element Textures destructor as it's erased.
			_cachedTextures.erase(aTextureName);
			return true;
		}
		
		// No texture was found with the supplied key so log that and return NO;
		if(DEBUG) std::cout << "INFO - Resource Manager: A texture with the key " << aTextureName << " could not be found to release.\n";
		return false;
		
	}


	void ResourceManger::releaseAllTextures ()
	{
		if(DEBUG) std::cout << "INFO - Resource Manager: Releasing all cached textures.\n";
		_cachedTextures.clear();
	}
}