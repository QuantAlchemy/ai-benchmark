/*
 *  Transform2D.h
 *  GLGamev2
 *
 *  Created by Michael Daley on 08/07/2009.
 *  Copyright 2009 Michael Daley. All rights reserved.
 *
 */
// Special thanks to Micheal Daley for sharing this code with me

#ifndef __TRANSFORMS_H__
#define __TRANSFORMS_H__

// Loads the supplied matrix with the identity matrix
static inline void loadIdentityMatrix(float aMatrix[]) {
    aMatrix[0] = 1.0f; aMatrix[1] = 0.0f; aMatrix[2] = 0.0f;
    aMatrix[3] = 0.0f; aMatrix[4] = 1.0f; aMatrix[5] = 0.0f;
    aMatrix[6] = 0.0f; aMatrix[7] = 0.0f; aMatrix[8] = 1.0f;
}

// Applies a rotation transformation to the supplied matrix.  A translation is also applied
// which allows the rotation to take place around a specific point.
static inline void rotateMatrix(float aMatrix[], GPoint aRotationPoint, float aRotation) {
    // Translate into the image to the point around which rotation will occur
    aMatrix[6] = aRotationPoint.x * aMatrix[0] + aRotationPoint.y * aMatrix[3] + aMatrix[6];
    aMatrix[7] = aRotationPoint.x * aMatrix[1] + aRotationPoint.y * aMatrix[4] + aMatrix[7];
    
    // Turns the degrees passed in to radians for the calculations
    float radians = DEGREES_TO_RADIANS(aRotation);
    
    // Calculate the sin and cos for the rotation
	float cosTheta = cosf(radians);
	float sinTheta = sinf(radians);
    
    // Take a copy of the matrix as we will need this during the calculation
	float m0 = aMatrix[0];
	float m1 = aMatrix[1];
	float m2 = aMatrix[2];
	float m3 = aMatrix[3];
	float m4 = aMatrix[4];
	float m5 = aMatrix[5];
    
    // Perform the rotation transformation on the images matrix
	aMatrix[0] = cosTheta * m0 + sinTheta * m3;
	aMatrix[1] = cosTheta * m1 + sinTheta * m4;
	aMatrix[2] = cosTheta * m2 + sinTheta * m5;
	aMatrix[3] = -sinTheta * m0 + cosTheta * m3;
	aMatrix[4] = -sinTheta * m1 + cosTheta * m4;
	aMatrix[5] = -sinTheta * m2 + cosTheta * m5;   
    
    // Now reverse the translation we did to the point of rotation
    aMatrix[6] = -aRotationPoint.x * aMatrix[0] + -aRotationPoint.y * aMatrix[3] + aMatrix[6];
    aMatrix[7] = -aRotationPoint.x * aMatrix[1] + -aRotationPoint.y * aMatrix[4] + aMatrix[7];
}

// Applies the scale transformation to the matrix using the scale information provided in |aScale|
static inline void scaleMatrix(float aMatrix[], GPoint aScale) {
    // Perform the scale transformation on the images matrix
    aMatrix[0] *= aScale.x;
    aMatrix[1] *= aScale.x;
    aMatrix[2] *= aScale.x;
    aMatrix[3] *= aScale.y;
    aMatrix[4] *= aScale.y;
    aMatrix[5] *= aScale.y;
}

// Applies the translation transformation to the matrix using |aPoint"
static inline void translateMatrix(float aMatrix[], GPoint aPoint) {
    aMatrix[6] = aPoint.x * aMatrix[0] + aPoint.y * aMatrix[3] + aMatrix[6];
    aMatrix[7] = aPoint.x * aMatrix[1] + aPoint.y * aMatrix[4] + aMatrix[7];
}

// Transforms the vertices in |qQuad| using |aMatrix| with the results being loaded into |aTransformedQuad|
static inline void transformMatrix(float aMatrix[], Quad2f *aQuad, Quad2f *aTransformedQuad) {
	aTransformedQuad[0].tl_x = aQuad[0].tl_x * aMatrix[0] + aQuad[0].tl_y * aMatrix[3] + aMatrix[6];
	aTransformedQuad[0].tl_y = aQuad[0].tl_x * aMatrix[1] + aQuad[0].tl_y * aMatrix[4] + aMatrix[7];
    
	aTransformedQuad[0].tr_x = aQuad[0].tr_x * aMatrix[0] + aQuad[0].tr_y * aMatrix[3] + aMatrix[6];
	aTransformedQuad[0].tr_y = aQuad[0].tr_x * aMatrix[1] + aQuad[0].tr_y * aMatrix[4] + aMatrix[7];
	
	aTransformedQuad[0].bl_x = aQuad[0].bl_x * aMatrix[0] + aQuad[0].bl_y * aMatrix[3] + aMatrix[6];
	aTransformedQuad[0].bl_y = aQuad[0].bl_x * aMatrix[1] + aQuad[0].bl_y * aMatrix[4] + aMatrix[7];
	
	aTransformedQuad[0].br_x = aQuad[0].br_x * aMatrix[0] + aQuad[0].br_y * aMatrix[3] + aMatrix[6];
	aTransformedQuad[0].br_y = aQuad[0].br_x * aMatrix[1] + aQuad[0].br_y * aMatrix[4] + aMatrix[7];
}

#endif
