/*
 *  Entity.cpp
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/20/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#include "Entity.h"

namespace Advanced2D {
	
	Entity::Entity(enum RenderType renderType)
	{
		this->renderType = renderType;
		this->ID = -1;
		this->name = "";
		this->visible = true;
		this->alive = true;
		this->objectType = 0;
		this->lifetimeLength = 0;
		this->lifetimeTimer.reset();
	}
	
};
