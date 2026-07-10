//
//  Asteroids_iphoneAppDelegate.h
//  Asteroids_iphone
//
//  Created by Ralph Smith on 9/5/10.
//  Copyright Ralph Smith 2010. All rights reserved.
//

#import <UIKit/UIKit.h>

@class EAGLView;

@interface Asteroids_iphoneAppDelegate : NSObject <UIApplicationDelegate> {
    UIWindow *window;
    EAGLView *glView;
}

@property (nonatomic, retain) IBOutlet UIWindow *window;
@property (nonatomic, retain) IBOutlet EAGLView *glView;

@end

