/*
 *  Singleton.h
 *  Advanced2D
 *
 *  Created by Ralph Smith on 6/23/10.
 *  Copyright 2010 Ralph Smith. All rights reserved.
 *
 */

#ifndef __SINGLETON_H__
#define __SINGLETON_H__

class SingletonObj
{
public:
	static inline SingletonObj& Instance()
	{
		static SingletonObj inst;
		return inst;
	}
	
	void PrintThis (void);
	
protected:
	SingletonObj (void) {}
	SingletonObj (const SingletonObj&) {}
	SingletonObj& operator= (const SingletonObj&) {return *this;}
	~SingletonObj() {}
	
private:
	
};

#define g_SingletonObj SingletonObj::Instance()


#endif
