/*
 *  main.cc
 *  Advanced2D
 *
 *  Created by Ralph Smith on 9/4/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */
 
#include <iostream>
#include <stdio.h>

#ifdef __APPLE__
#include <GLUT/glut.h>
#elif _WIN32
#include <GL/glut.h>
#else
#include <GL/glut.h>
#endif

#include "game.h"

#define WIDTH 1024
#define HEIGHT 768

void handleResize(int w, int h) {
	glViewport(0, 0, w, h);
	glMatrixMode(GL_PROJECTION);
	glLoadIdentity();
	
	glOrtho(0.0f, w, 0.0f, h, -1.0f, 1.0f);
}

void handleKeypress(unsigned char key, int x, int y) {
	game_input(key, x, y);
}

void update(int value) {
	g_engine->Update();
	
	if (gameover) {
		handleKeypress(27, 0, 0);
	}
	
	glutPostRedisplay();
	glutTimerFunc(25, update, 0);
}

void draw() {
	glutSwapBuffers();
}

int main (int argc, char * argv[]) {

	glutInit(&argc, argv);
	glutInitDisplayMode(GLUT_DOUBLE | GLUT_RGB | GLUT_DEPTH);
	glutInitWindowSize(WIDTH, HEIGHT);
	glutCreateWindow("Advanced 2D Game Engine Test");
	
	g_engine = new Advanced2D::Engine();
	
	if (!game_preload()) {
		printf("Error preloading game\n");
		return 0;
	}
	
	if (!g_engine->Init(WIDTH, HEIGHT, 32, false)) {
		printf("Error initializing the engine");
		return 0;
	}
	
	glutDisplayFunc(draw);
	glutKeyboardFunc(handleKeypress);
	glutReshapeFunc(handleResize);
	glutTimerFunc(25, update, 0);
	
	glutMainLoop();
	
    return 0;
}
