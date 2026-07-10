/*
 *  game.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 9/4/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#ifndef __GAME_H__
#define __GAME_H__


#include "Engine/Advanced2D.h"
#include "Resources.h"

#define OBJECT_BACKGROUND 10
#define OBJECT_SHIP 20
#define OBJECT_EXPLOSION 30
#define OBJECT_BULLET 40
#define OBJECT_ASTEROID 50

#define BULLET_VEL 25.0
#define ASTEROID_VEL 3.0
#define ASTEROID_VEL_MIN 1
#define ASTEROID_VEL_MAX 6
#define MAX_ASTEROID_NUM 100000

#define OMNI_FIRE 1

// randomly return 1 or -1
#define myrand() (((rand()%2) == 0) ? -1 : 1)


Advanced2D::Engine* g_engine;
bool gameover;

double nearest_distance;
Timer asteroid_timer;
PackedSpriteSheet* packedSpriteSheet;

void firebullet() {
	//get the ship from the entity manager
	Sprite *ship = (Sprite*)(g_engine->findEntity(OBJECT_SHIP));
	if (!ship) {
		return;
	}
	
	//create bullet sprite
	Sprite *bullet = packedSpriteSheet->getPackedSpriteNamed(PLASMA_T);
	bullet->setObjectType(OBJECT_BULLET);
	bullet->setMoveTimer(1);
	bullet->setLifetime(5000);
	
	//set bullet equal to ship's rotation angle
	double ship_angle = ship->getRotation();
	bullet->setRotation(ship_angle);
	
	//set bullet's starting position
	double x = ship->getX();
	double y = ship->getY();
	x += g_engine->math->LinearVelocityX(ship_angle)*(ship->getWidth()/2);	// scale based on ships rotation so bullet shoots from middle of ship
	y += -g_engine->math->LinearVelocityY(ship_angle)*(ship->getHeight()/2);
	
	bullet->setPosition(x,y);
	
	//set bullet's velocity
	double vx = g_engine->math->LinearVelocityX(ship_angle) * BULLET_VEL;
	//because OpenGL is using a negative angle for ship rotation we need
	//to take the negative to get the correct direciton to the target
	double vy = -g_engine->math->LinearVelocityY(ship_angle) * BULLET_VEL;
	bullet->setVelocity(vx, vy);
	
	//fire bullet    
	g_engine->addEntity(bullet);
	sharedSoundManager.Play("fire");
	//	sharedSoundManager.Play("fire1");
	//	sharedSoundManager.Play("fire2");
}

void addAsteroid() {
	//add an asteroid
	Sprite *asteroid = packedSpriteSheet->getPackedSpriteNamed(ASTEROID_ANIM);
	asteroid->setObjectType(OBJECT_ASTEROID);
	asteroid->setVelocity(-(rand()% ASTEROID_VEL_MAX + ASTEROID_VEL_MIN), 0);
	asteroid->setPosition(g_engine->getScreenWidth(),rand()%(g_engine->getScreenHeight()+1));
	asteroid->setTotalFrames(64);
	asteroid->setColumns(8);
	asteroid->setSize(60,60);
	asteroid->setFrameTimer( rand() % 100 );
	asteroid->setCurrentFrame( rand() % 64 );
	if (rand()%2==0) asteroid->setAnimationDirection(-1);
	g_engine->addEntity( asteroid );
}

void targetNearestAsteroid(Sprite *asteroid) {
	Sprite *ship = (Sprite*)g_engine->findEntity(OBJECT_SHIP);
	if (!ship) {
		//g_engine->message("Error targeting asteroid can't locating ship in entity manager!","ERROR");
		//g_engine->Close();
		return;
	}
	
	//get asteroid's position
	Vector3 target = asteroid->getPosition();
	
	//calculate distance to target
	Vector3 ship_position = ship->getPosition();
	double dist = ship_position.Distance( target );
	if (dist < nearest_distance) {
		Vector3 nearest_asteroid;
		nearest_asteroid = target;
		nearest_distance = dist;
		
		//lead the target for better accuracy
		Vector3 target_lead;
		target_lead.setX(asteroid->getVelocity().getX() * 0.01f);
		target_lead.setY(asteroid->getVelocity().getY() * 0.01f);
		nearest_asteroid.setX(nearest_asteroid.getX() + target_lead.getX());
		nearest_asteroid.setY(nearest_asteroid.getY() + target_lead.getY());
		
		//calculate angle to target
		double ship_angle = ship->getRotation();
		ship_angle = g_engine->math->AngleToTarget(ship_position,nearest_asteroid);
		
		// for proper OpenGL rotation we subtract the angle
		ship->setRotation(90 - g_engine->math->toDegrees(ship_angle));
    }
}

bool game_preload() {
	//display engine version in a message box
	g_engine->message(g_engine->getVersionText(), "TEST ENGINE");
	g_engine->setAppTitle ("Test Engine");
	
	//return fail to terminate the engine
	return true;
}

bool game_init() {
	packedSpriteSheet = new PackedSpriteSheet(RESOURCES"GameAtlas.tga");
	
	Sprite* background = packedSpriteSheet->getPackedSpriteNamed(GALAXIES_BG);
	background->setObjectType(OBJECT_BACKGROUND);
	background->setPosition(g_engine->getScreenWidth()/2, g_engine->getScreenHeight()/2);
	g_engine->addEntity(background);
	
	Sprite* ship = packedSpriteSheet->getPackedSpriteNamed(SHIP_T);
	ship->setObjectType(OBJECT_SHIP);
	ship->setPosition(g_engine->getScreenWidth()/2, g_engine->getScreenHeight()/2);
	ship->setRotation(90);
	g_engine->addEntity(ship);
	
	sharedSoundManager.LoadSound ("boom", RESOURCES"boom.wav");
	sharedSoundManager.LoadSound ("explode1", RESOURCES"explode1.wav");
	sharedSoundManager.LoadSound ("explode2", RESOURCES"explode2.wav");
	sharedSoundManager.LoadSound ("fire", RESOURCES"fire.wav");
	sharedSoundManager.LoadSound ("fire1", RESOURCES"fire1.wav");
	sharedSoundManager.LoadSound ("fire2", RESOURCES"fire2.wav");
	sharedSoundManager.LoadSound ("music", RESOURCES"music.wav", kMUSIC);
	
	// main message loop
	gameover = false;
	return true;
}

void game_input(unsigned char key, int x, int y) {
	switch (key) {
		case 'j':
		{
			Sprite *ship = (Sprite*)g_engine->findEntity(OBJECT_SHIP);
			if (!ship) {
				return;
			}
			ship->setRotation(ship->getRotation()-10);
		} break;
		case 'k':
		{
			Sprite *ship = (Sprite*)g_engine->findEntity(OBJECT_SHIP);
			if (!ship) {
				return;
			}
			ship->setRotation(ship->getRotation()+10);
		} break;
		case 'n':
		{
			// add new ship if your dead
			if (g_engine->findEntity(OBJECT_SHIP) == NULL) {
				Sprite* ship = packedSpriteSheet->getPackedSpriteNamed(SHIP_T);
				ship->setObjectType(OBJECT_SHIP);
				ship->setPosition(g_engine->getScreenWidth()/2, g_engine->getScreenHeight()/2);
				g_engine->addEntity(ship);
			}
		} break;
		case 'a':
		{
			addAsteroid();
		} break;
		case 32:  // Space bar
		{
			firebullet();
		} break;
		case 27: //Escape key
		{
			g_engine->Close();
			exit(0);
		} break;
	}
}

void game_update() {
	nearest_distance = 999999;
	
	if (asteroid_timer.stopwatch(500)) {
		if (g_engine->getEntityCount(OBJECT_ASTEROID) < MAX_ASTEROID_NUM) {
			addAsteroid();
		}
	}
}

void game_end() {
	printf("game end\n");
	delete g_engine;
}

void game_render3d() {}

void game_render2d() {}

void game_entityUpdate(Advanced2D::Entity* entity) {
	switch (entity->getObjectType()) {			
		case OBJECT_BULLET:
		{
			Sprite* bullet = (Sprite*)entity;
			double x = bullet->getX();
			double y = bullet->getY();
			if (x > g_engine->getScreenWidth() || x < 0 || y > g_engine->getScreenHeight() || y < 0) {
				bullet->setAlive(false);
			}
		} break;
			
		case OBJECT_ASTEROID:
		{
			Sprite* asteroid = (Sprite*)entity;
			if (asteroid->getX() < -64) asteroid->setX(g_engine->getScreenWidth());
			if (OMNI_FIRE) {
				targetNearestAsteroid(asteroid);
			}
		} break;
		default:
			break;
	}
}

void game_entityRender(Advanced2D::Entity* entity) {}

void game_entityCollision(Advanced2D::Entity* entity1, Advanced2D::Entity* entity2) {
	if (entity1->getObjectType() == OBJECT_ASTEROID)
	{
		Sprite *asteroid = (Sprite*)entity1;
		
		if (entity2->getObjectType() == OBJECT_BULLET || entity2->getObjectType() == OBJECT_SHIP)
		{
			//create an explosion
			Sprite *expl = packedSpriteSheet->getPackedSpriteNamed(EXPLOSION_ANIM);
			expl->setObjectType(OBJECT_EXPLOSION);
			
			expl->setColumns(6);
			expl->setCollidable(false);
			expl->setSize(128,128);
			double x = asteroid->getPosition().getX();
			double y = asteroid->getPosition().getY();
			expl->setPosition(x-32,y-32);
			expl->setTotalFrames(30);
			expl->setFrameTimer(40);
			expl->setLifetime(1000);
			g_engine->addEntity(expl);
			
			//remove the asteroid
			entity2->setAlive(false);
			
			//remove the bullet
			entity1->setAlive(false);
			
			//play explosion sound
			sharedSoundManager.Play("boom");
			//			sharedSoundManager.Play("explode1");
			//			sharedSoundManager.Play("explode2");
		}
	}
}

#endif