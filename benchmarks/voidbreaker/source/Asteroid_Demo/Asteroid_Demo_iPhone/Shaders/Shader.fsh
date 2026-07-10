//
//  Shader.fsh
//  Asteroids_iphone
//
//  Created by Ralph Smith on 9/5/10.
//  Copyright Ralph Smith 2010. All rights reserved.
//

varying lowp vec4 colorVarying;

void main()
{
    gl_FragColor = colorVarying;
}
