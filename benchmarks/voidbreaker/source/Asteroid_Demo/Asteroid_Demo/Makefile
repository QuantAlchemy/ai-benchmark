CC = g++
#CFLAGS = -Wall
#PROG = asteroids
#PROG = asteroids_mac

SRCS = main.cpp Engine/*.cpp

ifeq ($(shell uname),Darwin)
	PROG = asteroids_mac
	LIBS = -framework OpenGL -framework GLUT -framework OpenAL
else
	PROG = asteroids_linux
	LIBS = -lglut -lGLU -lalut
endif

all: $(PROG)

$(PROG): $(SRCS)
	$(CC) $(CFLAGS) -o $(PROG) $(SRCS) $(LIBS)

clean:
	rm -f $(PROG)
