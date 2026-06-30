//
//  Asteroids_iphoneAppDelegate.m
//  Asteroids_iphone
//
//  Created by Ralph Smith on 9/5/10.
//  Copyright Ralph Smith 2010. All rights reserved.
//

#import "Asteroids_iphoneAppDelegate.h"
#import "EAGLView.h"

@implementation Asteroids_iphoneAppDelegate

@synthesize window;
@synthesize glView;

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
    [glView startAnimation];
    return YES;
}

- (void)applicationWillResignActive:(UIApplication *)application
{
    [glView stopAnimation];
}

- (void)applicationDidBecomeActive:(UIApplication *)application
{
    [glView startAnimation];
}

- (void)applicationWillTerminate:(UIApplication *)application
{
    [glView stopAnimation];
}

- (void)dealloc
{
    [window release];
    [glView release];

    [super dealloc];
}

@end
