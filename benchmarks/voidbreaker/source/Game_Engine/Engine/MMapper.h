
#ifndef __MMAPPER_H__
#define __MMAPPER_H__

#include <stdio.h>
#include <string>

#ifdef _WIN32
#include <windows.h>
#else
#include <sys/mman.h>
#include <unistd.h>
#endif

class MMapper {
	
public:
	MMapper (std::string path, std::string permissions, void** dest, unsigned long *len);
	~MMapper ();

private:
	void *mDataPtr;
	unsigned long mLength;
};

inline MMapper::MMapper (std::string path, std::string permissions, void** dest, 
								unsigned long *len)
/*
	Inputs:	path to file, permissions (ie. "rb"), data handle, pointer
	 			to file length
	Outputs:	dest and length
*/
{
#ifndef _WIN32  // system other than windows
	FILE* f = fopen (path.c_str(), permissions.c_str());
	if (f) {
		mLength = *len = lseek (fileno(f), 0, SEEK_END);
		mDataPtr = *dest = mmap(0, mLength, PROT_READ, MAP_SHARED, fileno(f), 0);
		fclose(f);

		if(long(mDataPtr) == -1)
		{
			perror("MMapper");
			mLength = *len = 0;
			mDataPtr = *dest = 0;
		}
	}
	else {
		mLength = *len = 0;
		mDataPtr = *dest = 0;
	}
#else
	FILE* f = (FILE*)CreateFile (path.c_str(), GENERIC_READ, FILE_SHARE_READ,  NULL, 
								OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
	if (!f) {
		perror("MMapper");
		mLength = *len = 0;
		mDataPtr = *dest = 0;
	}
	FILE* m = (FILE*)CreateFileMapping (f, NULL, PAGE_READONLY,  0, 0, 0);
	if (m) {
		mDataPtr = *dest = MapViewOfFile (m, FILE_MAP_READ, 0, 0, 0);
		mLength = *len = GetFileSize (f, NULL);

		CloseHandle((HANDLE*)f);
		CloseHandle((HANDLE*)m);
		if (mDataPtr == NULL) {
			perror("MMapper");
			mLength = *len = 0;
			mDataPtr = *dest = 0;
		}
	}
	else {
		mLength = *len = 0;
		mDataPtr = *dest = 0;
	}
#endif
}


inline MMapper::~MMapper ()
{
#ifndef _WIN32  // system other than windows
	if (mDataPtr) munmap ((char*)mDataPtr, mLength);
#else
	if (mDataPtr) UnmapViewOfFile(mDataPtr);
#endif
}

#endif
