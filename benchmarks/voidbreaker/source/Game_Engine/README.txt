Platform independent 2D game Engine
===================================

A platform independent 2D game engine.

Supported Platforms
-------------------

	Mac OSX
	Linux
	Windows
	iPhone
  
How to
------

To build:

	Linux/Mac OSX
		use make

	iPhone
		open the iPhone xcode project and change the path in the Resources.h file to the absolute
		path of where you put the demo project at.

	Windows
		open the VC++ project and ensure you have OpenAL, OpenGL, and GLUT downloaded and installed
		you will also need to ensure that the VC++ IDE know to link these libraries if you don't
		know how to do this Google is your friend.