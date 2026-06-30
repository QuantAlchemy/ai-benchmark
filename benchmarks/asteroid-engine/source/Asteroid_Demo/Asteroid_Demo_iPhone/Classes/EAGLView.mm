//
//  EAGLView.m
//  Asteroids_iphone
//
//  Created by Ralph Smith on 9/5/10.
//  Copyright Ralph Smith 2010. All rights reserved.
//

#import "EAGLView.h"

#import "ES1Renderer.h"
#import "ES2Renderer.h"
#include "game.h"


// A class extension to declare private methods
@interface EAGLView ()
- (bool) initEngine;
@end

@implementation EAGLView

@synthesize animating;
@dynamic animationFrameInterval;

// You must implement this method
+ (Class)layerClass
{
    return [CAEAGLLayer class];
}

//The EAGL view is stored in the nib file. When it's unarchived it's sent -initWithCoder:
- (id)initWithCoder:(NSCoder*)coder
{    
    if ((self = [super initWithCoder:coder]))
    {
        // Get the layer
        CAEAGLLayer *eaglLayer = (CAEAGLLayer *)self.layer;

        eaglLayer.opaque = TRUE;
        eaglLayer.drawableProperties = [NSDictionary dictionaryWithObjectsAndKeys:
                                        [NSNumber numberWithBool:FALSE], kEAGLDrawablePropertyRetainedBacking, kEAGLColorFormatRGBA8, kEAGLDrawablePropertyColorFormat, nil];

		// -- only supporting OpenGL ES 1.0
//        renderer = [[ES2Renderer alloc] init];
//
//        if (!renderer)
//        {
            renderer = [[ES1Renderer alloc] init];

            if (!renderer)
            {
                [self release];
                return nil;
            }
//        }

        animating = FALSE;
        displayLinkSupported = FALSE;
        animationFrameInterval = 1;
        displayLink = nil;
        animationTimer = nil;
		
		[self initEngine];
		
        // A system version of 3.1 or greater is required to use CADisplayLink. The NSTimer
        // class is used as fallback when it isn't available.
        NSString *reqSysVer = @"3.1";
        NSString *currSysVer = [[UIDevice currentDevice] systemVersion];
        if ([currSysVer compare:reqSysVer options:NSNumericSearch] != NSOrderedAscending)
            displayLinkSupported = TRUE;
    }

    return self;
}

- (bool)initEngine {
	NSLog(@"initOpenGL");
	// Get the bounds of the main screen
	CGRect rect = [[UIScreen mainScreen] bounds];

	g_engine = new Advanced2D::Engine();
	
	if (!game_preload()) {
		printf("Error preloading game\n");
		return 0;
	}
	if (!g_engine->Init(rect.size.width, rect.size.height, 32, false)) {
		printf("Error initializing the engine");
		return 0;
	}

	return true;
}

- (void)drawView:(id)sender
{
	g_engine->Update();
	if (gameover) {
		game_input(27, 0, 0);
	}
	[renderer render];
}


#pragma mark -
#pragma mark Touches

// Pass on all touch events to the sharedInput
- (void)touchesBegan:(NSSet*)touches withEvent:(UIEvent*)event {
	NSSet *allTouches = [event allTouches];
	switch ([allTouches count]) {
		case 1:
			game_input(32, 0, 0);
			break;
		case 2:
			game_input('n', 0, 0);
			break;
		case 3:
			game_input(27, 0, 0);
			break;
		default:
			break;
	}
}


- (void)touchesMoved:(NSSet*)touches withEvent:(UIEvent*)event {
}


- (void)touchesEnded:(NSSet*)touches withEvent:(UIEvent*)event {
}

- (void)touchesCancelled:(NSSet *)touches withEvent:(UIEvent *)event {
}


- (void)layoutSubviews
{
    [renderer resizeFromLayer:(CAEAGLLayer*)self.layer];
    [self drawView:nil];
}

- (NSInteger)animationFrameInterval
{
    return animationFrameInterval;
}

- (void)setAnimationFrameInterval:(NSInteger)frameInterval
{
    // Frame interval defines how many display frames must pass between each time the
    // display link fires. The display link will only fire 30 times a second when the
    // frame internal is two on a display that refreshes 60 times a second. The default
    // frame interval setting of one will fire 60 times a second when the display refreshes
    // at 60 times a second. A frame interval setting of less than one results in undefined
    // behavior.
    if (frameInterval >= 1)
    {
        animationFrameInterval = frameInterval;

        if (animating)
        {
            [self stopAnimation];
            [self startAnimation];
        }
    }
}

- (void)startAnimation
{
    if (!animating)
    {
        if (displayLinkSupported)
        {
            // CADisplayLink is API new to iPhone SDK 3.1. Compiling against earlier versions will result in a warning, but can be dismissed
            // if the system version runtime check for CADisplayLink exists in -initWithCoder:. The runtime check ensures this code will
            // not be called in system versions earlier than 3.1.

            displayLink = [NSClassFromString(@"CADisplayLink") displayLinkWithTarget:self selector:@selector(drawView:)];
            [displayLink setFrameInterval:animationFrameInterval];
            [displayLink addToRunLoop:[NSRunLoop currentRunLoop] forMode:NSDefaultRunLoopMode];
        }
        else
            animationTimer = [NSTimer scheduledTimerWithTimeInterval:(NSTimeInterval)((1.0 / 60.0) * animationFrameInterval) target:self selector:@selector(drawView:) userInfo:nil repeats:TRUE];

        animating = TRUE;
    }
}

- (void)stopAnimation
{
    if (animating)
    {
        if (displayLinkSupported)
        {
            [displayLink invalidate];
            displayLink = nil;
        }
        else
        {
            [animationTimer invalidate];
            animationTimer = nil;
        }

        animating = FALSE;
    }
}

- (void)dealloc
{
    [renderer release];

    [super dealloc];
}

@end
