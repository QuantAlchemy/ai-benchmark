#include <SDL.h>

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <map>
#include <mutex>
#include <random>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace {

constexpr int kScreenWidth = 1024;
constexpr int kScreenHeight = 768;
constexpr double kBulletVelocity = 25.0;
constexpr int kAsteroidVelocityMin = 1;
constexpr int kAsteroidVelocityMax = 6;
constexpr int kMaxAsteroids = 100000;

enum ObjectType {
    ObjectBackground = 10,
    ObjectShip = 20,
    ObjectExplosion = 30,
    ObjectBullet = 40,
    ObjectAsteroid = 50,
};

struct Rect {
    int x = 0;
    int y = 0;
    int w = 0;
    int h = 0;
};

struct Vec2 {
    double x = 0.0;
    double y = 0.0;
};

struct AtlasSprite {
    Rect frame;
    int frameW = 0;
    int frameH = 0;
    int columns = 1;
    int totalFrames = 1;
};

struct Sprite {
    ObjectType type = ObjectBackground;
    AtlasSprite atlas;
    Vec2 pos;
    Vec2 vel;
    double rotation = 0.0;
    double scale = 1.0;
    int currentFrame = 0;
    int animationDirection = 1;
    int frameTimerMs = 0;
    uint64_t frameStartMs = 0;
    int moveTimerMs = 16;
    uint64_t moveStartMs = 0;
    uint64_t bornMs = 0;
    uint64_t lifetimeMs = 0;
    bool alive = true;
    bool visible = true;
    bool collidable = true;
};

struct TgaImage {
    int width = 0;
    int height = 0;
    std::vector<uint8_t> rgba;
};

uint64_t nowMs() {
    return SDL_GetTicks64();
}

double degreesToRadians(double degrees) {
    return degrees * M_PI / 180.0;
}

double linearVelocityX(double angle) {
    return std::cos(degreesToRadians(angle));
}

double linearVelocityY(double angle) {
    return std::sin(degreesToRadians(angle));
}

double distance(Vec2 a, Vec2 b) {
    const double dx = a.x - b.x;
    const double dy = a.y - b.y;
    return std::sqrt(dx * dx + dy * dy);
}

double angleToTarget(Vec2 source, Vec2 target) {
    return std::atan2(target.y - source.y, target.x - source.x);
}

std::filesystem::path executableDir() {
    char *base = SDL_GetBasePath();
    if (!base) {
        return std::filesystem::current_path();
    }
    std::filesystem::path result(base);
    SDL_free(base);
    return result;
}

uint16_t readLe16(const uint8_t *p) {
    return static_cast<uint16_t>(p[0] | (p[1] << 8));
}

TgaImage loadTga(const std::filesystem::path &path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        throw std::runtime_error("could not open " + path.string());
    }

    std::vector<uint8_t> bytes((std::istreambuf_iterator<char>(input)),
                               std::istreambuf_iterator<char>());
    if (bytes.size() < 18) {
        throw std::runtime_error("invalid TGA header in " + path.string());
    }

    const uint8_t idLength = bytes[0];
    const uint8_t colorMapType = bytes[1];
    const uint8_t imageType = bytes[2];
    const int width = readLe16(&bytes[12]);
    const int height = readLe16(&bytes[14]);
    const int bitsPerPixel = bytes[16];
    const uint8_t descriptor = bytes[17];

    if (colorMapType != 0 || width <= 0 || height <= 0 ||
        (bitsPerPixel != 24 && bitsPerPixel != 32) ||
        (imageType != 2 && imageType != 10)) {
        throw std::runtime_error("unsupported TGA format in " + path.string());
    }

    const int bytesPerPixel = bitsPerPixel / 8;
    size_t offset = 18 + idLength;
    std::vector<uint8_t> stored(static_cast<size_t>(width) * height * 4);

    auto writePixel = [&](int index, const uint8_t *pixel) {
        stored[index * 4 + 0] = pixel[2];
        stored[index * 4 + 1] = pixel[1];
        stored[index * 4 + 2] = pixel[0];
        stored[index * 4 + 3] = bytesPerPixel == 4 ? pixel[3] : 255;
    };

    const int pixelCount = width * height;
    int pixelIndex = 0;
    if (imageType == 2) {
        while (pixelIndex < pixelCount) {
            if (offset + bytesPerPixel > bytes.size()) {
                throw std::runtime_error("truncated TGA image in " + path.string());
            }
            writePixel(pixelIndex++, &bytes[offset]);
            offset += bytesPerPixel;
        }
    } else {
        while (pixelIndex < pixelCount) {
            if (offset >= bytes.size()) {
                throw std::runtime_error("truncated TGA RLE data in " + path.string());
            }
            const uint8_t packet = bytes[offset++];
            const int count = (packet & 0x7f) + 1;
            if (packet & 0x80) {
                if (offset + bytesPerPixel > bytes.size()) {
                    throw std::runtime_error("truncated TGA RLE pixel in " + path.string());
                }
                for (int i = 0; i < count && pixelIndex < pixelCount; ++i) {
                    writePixel(pixelIndex++, &bytes[offset]);
                }
                offset += bytesPerPixel;
            } else {
                for (int i = 0; i < count && pixelIndex < pixelCount; ++i) {
                    if (offset + bytesPerPixel > bytes.size()) {
                        throw std::runtime_error("truncated TGA raw packet in " + path.string());
                    }
                    writePixel(pixelIndex++, &bytes[offset]);
                    offset += bytesPerPixel;
                }
            }
        }
    }

    const bool originTop = (descriptor & 0x20) != 0;
    TgaImage image;
    image.width = width;
    image.height = height;
    image.rgba.resize(stored.size());

    for (int y = 0; y < height; ++y) {
        const int sourceY = originTop ? y : (height - 1 - y);
        std::memcpy(&image.rgba[static_cast<size_t>(y) * width * 4],
                    &stored[static_cast<size_t>(sourceY) * width * 4],
                    static_cast<size_t>(width) * 4);
    }

    return image;
}

SDL_Texture *createTexture(SDL_Renderer *renderer, const TgaImage &image) {
    SDL_Texture *texture = SDL_CreateTexture(renderer, SDL_PIXELFORMAT_RGBA32,
                                            SDL_TEXTUREACCESS_STATIC,
                                            image.width, image.height);
    if (!texture) {
        throw std::runtime_error(SDL_GetError());
    }
    SDL_SetTextureBlendMode(texture, SDL_BLENDMODE_BLEND);
    if (SDL_UpdateTexture(texture, nullptr, image.rgba.data(), image.width * 4) != 0) {
        SDL_DestroyTexture(texture);
        throw std::runtime_error(SDL_GetError());
    }
    return texture;
}

class AudioMixer {
public:
    ~AudioMixer() {
        if (device_ != 0) {
            SDL_CloseAudioDevice(device_);
        }
    }

    bool init() {
        SDL_AudioSpec desired{};
        desired.freq = 44100;
        desired.format = AUDIO_F32SYS;
        desired.channels = 2;
        desired.samples = 1024;
        desired.callback = &AudioMixer::callback;
        desired.userdata = this;

        device_ = SDL_OpenAudioDevice(nullptr, 0, &desired, &obtained_, 0);
        if (device_ == 0) {
            std::fprintf(stderr, "Audio disabled: %s\n", SDL_GetError());
            return false;
        }
        SDL_PauseAudioDevice(device_, 0);
        return true;
    }

    void load(const std::string &name, const std::filesystem::path &path) {
        if (device_ == 0) {
            return;
        }

        SDL_AudioSpec spec{};
        uint8_t *data = nullptr;
        uint32_t len = 0;
        if (!SDL_LoadWAV(path.string().c_str(), &spec, &data, &len)) {
            std::fprintf(stderr, "Could not load %s: %s\n", path.string().c_str(), SDL_GetError());
            return;
        }

        SDL_AudioCVT cvt{};
        if (SDL_BuildAudioCVT(&cvt, spec.format, spec.channels, spec.freq,
                              obtained_.format, obtained_.channels, obtained_.freq) < 0) {
            SDL_FreeWAV(data);
            std::fprintf(stderr, "Could not convert %s: %s\n", path.string().c_str(), SDL_GetError());
            return;
        }

        std::vector<float> samples;
        if (cvt.needed) {
            cvt.len = static_cast<int>(len);
            cvt.buf = static_cast<uint8_t *>(SDL_malloc(static_cast<size_t>(len) * cvt.len_mult));
            if (!cvt.buf) {
                SDL_FreeWAV(data);
                return;
            }
            std::memcpy(cvt.buf, data, len);
            if (SDL_ConvertAudio(&cvt) != 0) {
                SDL_free(cvt.buf);
                SDL_FreeWAV(data);
                return;
            }
            const auto *converted = reinterpret_cast<const float *>(cvt.buf);
            samples.assign(converted, converted + (cvt.len_cvt / static_cast<int>(sizeof(float))));
            SDL_free(cvt.buf);
        } else {
            const auto *native = reinterpret_cast<const float *>(data);
            samples.assign(native, native + (len / sizeof(float)));
        }
        SDL_FreeWAV(data);

        std::lock_guard<std::mutex> lock(mutex_);
        sounds_[name] = std::move(samples);
    }

    void play(const std::string &name, float volume = 0.75f, bool loop = false) {
        if (device_ == 0) {
            return;
        }
        std::lock_guard<std::mutex> lock(mutex_);
        auto it = sounds_.find(name);
        if (it == sounds_.end() || it->second.empty()) {
            return;
        }
        voices_.push_back(Voice{&it->second, 0, volume, loop});
    }

private:
    struct Voice {
        const std::vector<float> *samples = nullptr;
        size_t pos = 0;
        float volume = 1.0f;
        bool loop = false;
    };

    static void callback(void *userdata, uint8_t *stream, int len) {
        static_cast<AudioMixer *>(userdata)->mix(reinterpret_cast<float *>(stream),
                                                 len / static_cast<int>(sizeof(float)));
    }

    void mix(float *stream, int sampleCount) {
        std::fill(stream, stream + sampleCount, 0.0f);
        std::lock_guard<std::mutex> lock(mutex_);

        for (auto &voice : voices_) {
            for (int i = 0; i < sampleCount; ++i) {
                if (voice.pos >= voice.samples->size()) {
                    if (voice.loop) {
                        voice.pos = 0;
                    } else {
                        break;
                    }
                }
                stream[i] += (*voice.samples)[voice.pos++] * voice.volume;
            }
        }

        voices_.erase(std::remove_if(voices_.begin(), voices_.end(), [](const Voice &voice) {
            return !voice.loop && voice.pos >= voice.samples->size();
        }), voices_.end());

        for (int i = 0; i < sampleCount; ++i) {
            stream[i] = std::clamp(stream[i], -1.0f, 1.0f);
        }
    }

    SDL_AudioDeviceID device_ = 0;
    SDL_AudioSpec obtained_{};
    std::mutex mutex_;
    std::map<std::string, std::vector<float>> sounds_;
    std::vector<Voice> voices_;
};

class Game {
public:
    Game(SDL_Renderer *renderer, SDL_Texture *atlas, std::filesystem::path resources)
        : renderer_(renderer), atlasTexture_(atlas), resources_(std::move(resources)) {
        rng_.seed(static_cast<unsigned int>(SDL_GetTicks()));
        defineAtlas();
        reset();
    }

    void loadAudio() {
        if (!audio_.init()) {
            return;
        }
        audio_.load("boom", resources_ / "boom.wav");
        audio_.load("fire", resources_ / "fire.wav");
        audio_.load("fire1", resources_ / "fire1.wav");
        audio_.load("fire2", resources_ / "fire2.wav");
        audio_.load("music", resources_ / "music.wav");
        audio_.play("music", 0.18f, true);
    }

    void handleKey(SDL_Keycode key) {
        Sprite *ship = find(ObjectShip);
        switch (key) {
        case SDLK_j:
            if (ship) {
                ship->rotation -= 10.0;
            }
            break;
        case SDLK_k:
            if (ship) {
                ship->rotation += 10.0;
            }
            break;
        case SDLK_a:
            addAsteroid();
            break;
        case SDLK_n:
            if (!ship) {
                addShip();
            }
            break;
        case SDLK_SPACE:
            fireBullet();
            break;
        default:
            break;
        }
    }

    void update() {
        const uint64_t t = nowMs();
        if (t - lastAsteroidMs_ >= 500 && count(ObjectAsteroid) < kMaxAsteroids) {
            lastAsteroidMs_ = t;
            addAsteroid();
        }

        nearestDistance_ = 999999.0;
        for (auto &sprite : sprites_) {
            if (!sprite.alive) {
                continue;
            }
            move(sprite, t);
            animate(sprite, t);
            entityUpdate(sprite);
            if (sprite.lifetimeMs > 0 && t - sprite.bornMs >= sprite.lifetimeMs) {
                sprite.alive = false;
            }
        }

        if (t - lastCollisionMs_ >= 50) {
            lastCollisionMs_ = t;
            testCollisions();
        }

        sprites_.erase(std::remove_if(sprites_.begin(), sprites_.end(), [](const Sprite &s) {
            return !s.alive;
        }), sprites_.end());
    }

    void render() {
        SDL_SetRenderDrawColor(renderer_, 0, 0, 0, 255);
        SDL_RenderClear(renderer_);
        for (const auto &sprite : sprites_) {
            if (sprite.visible && sprite.alive) {
                renderSprite(sprite);
            }
        }
        renderHud();
        SDL_RenderPresent(renderer_);
    }

private:
    int topYFromOriginal(int bottomY, int h) const {
        return 2048 - bottomY - h;
    }

    void defineAtlas() {
        atlas_["galaxies"] = AtlasSprite{{2, 772, 1024, 768}, 1024, 768, 1, 1};
        atlas_["ship"] = AtlasSprite{{1028, 610, 48, 71}, 48, 71, 1, 1};
        atlas_["plasma"] = AtlasSprite{{2022, 772, 8, 20}, 8, 20, 1, 1};
        atlas_["asteroid"] = AtlasSprite{{1542, 762, 480, 480}, 60, 60, 8, 64};
        atlas_["explosion"] = AtlasSprite{{1028, 2, 768, 640}, 128, 128, 6, 30};
    }

    void reset() {
        sprites_.clear();
        Sprite background;
        background.type = ObjectBackground;
        background.atlas = atlas_.at("galaxies");
        background.pos = {kScreenWidth / 2.0, kScreenHeight / 2.0};
        background.collidable = false;
        sprites_.push_back(background);
        addShip();
    }

    void addShip() {
        Sprite ship;
        ship.type = ObjectShip;
        ship.atlas = atlas_.at("ship");
        ship.pos = {kScreenWidth / 2.0, kScreenHeight / 2.0};
        ship.rotation = 90.0;
        ship.collidable = true;
        ship.bornMs = nowMs();
        sprites_.push_back(ship);
    }

    void addAsteroid() {
        std::uniform_int_distribution<int> yDist(0, kScreenHeight);
        std::uniform_int_distribution<int> velDist(kAsteroidVelocityMin, kAsteroidVelocityMax);
        std::uniform_int_distribution<int> frameDist(0, 63);
        std::uniform_int_distribution<int> timerDist(0, 99);
        std::uniform_int_distribution<int> coin(0, 1);

        Sprite asteroid;
        asteroid.type = ObjectAsteroid;
        asteroid.atlas = atlas_.at("asteroid");
        asteroid.pos = {static_cast<double>(kScreenWidth), static_cast<double>(yDist(rng_))};
        asteroid.vel = {-static_cast<double>(velDist(rng_)), 0.0};
        asteroid.currentFrame = frameDist(rng_);
        asteroid.frameTimerMs = std::max(15, timerDist(rng_));
        asteroid.animationDirection = coin(rng_) == 0 ? -1 : 1;
        asteroid.bornMs = nowMs();
        sprites_.push_back(asteroid);
    }

    void fireBullet() {
        Sprite *ship = find(ObjectShip);
        if (!ship) {
            return;
        }
        Sprite bullet;
        bullet.type = ObjectBullet;
        bullet.atlas = atlas_.at("plasma");
        bullet.rotation = ship->rotation;
        bullet.pos.x = ship->pos.x + linearVelocityX(ship->rotation) * (ship->atlas.frameW / 2.0);
        bullet.pos.y = ship->pos.y - linearVelocityY(ship->rotation) * (ship->atlas.frameH / 2.0);
        bullet.vel.x = linearVelocityX(ship->rotation) * kBulletVelocity;
        bullet.vel.y = -linearVelocityY(ship->rotation) * kBulletVelocity;
        bullet.moveTimerMs = 1;
        bullet.lifetimeMs = 5000;
        bullet.bornMs = nowMs();
        sprites_.push_back(bullet);
        audio_.play("fire", 0.8f, false);
    }

    Sprite *find(ObjectType type) {
        auto it = std::find_if(sprites_.begin(), sprites_.end(), [type](const Sprite &sprite) {
            return sprite.alive && sprite.type == type;
        });
        return it == sprites_.end() ? nullptr : &(*it);
    }

    int count(ObjectType type) const {
        return static_cast<int>(std::count_if(sprites_.begin(), sprites_.end(), [type](const Sprite &sprite) {
            return sprite.alive && sprite.type == type;
        }));
    }

    void move(Sprite &sprite, uint64_t t) {
        if (sprite.moveTimerMs > 0) {
            if (t <= sprite.moveStartMs + static_cast<uint64_t>(sprite.moveTimerMs)) {
                return;
            }
            sprite.moveStartMs = t;
        }
        sprite.pos.x += sprite.vel.x;
        sprite.pos.y += sprite.vel.y;
    }

    void animate(Sprite &sprite, uint64_t t) {
        if (sprite.atlas.totalFrames <= 1) {
            return;
        }
        if (sprite.frameTimerMs > 0) {
            if (t <= sprite.frameStartMs + static_cast<uint64_t>(sprite.frameTimerMs)) {
                return;
            }
            sprite.frameStartMs = t;
        }
        sprite.currentFrame += sprite.animationDirection;
        if (sprite.currentFrame < 0) {
            sprite.currentFrame = sprite.atlas.totalFrames - 1;
        }
        if (sprite.currentFrame >= sprite.atlas.totalFrames) {
            sprite.currentFrame = 0;
        }
    }

    void entityUpdate(Sprite &sprite) {
        if (sprite.type == ObjectBullet) {
            if (sprite.pos.x > kScreenWidth || sprite.pos.x < 0 ||
                sprite.pos.y > kScreenHeight || sprite.pos.y < 0) {
                sprite.alive = false;
            }
        } else if (sprite.type == ObjectAsteroid) {
            if (sprite.pos.x < -64.0) {
                sprite.pos.x = kScreenWidth;
            }
            targetNearestAsteroid(sprite);
        }
    }

    void targetNearestAsteroid(const Sprite &asteroid) {
        Sprite *ship = find(ObjectShip);
        if (!ship) {
            return;
        }
        Vec2 target = asteroid.pos;
        const double dist = distance(ship->pos, target);
        if (dist < nearestDistance_) {
            nearestDistance_ = dist;
            target.x += asteroid.vel.x * 0.01;
            target.y += asteroid.vel.y * 0.01;
            ship->rotation = 90.0 - angleToTarget(ship->pos, target) * 180.0 / M_PI;
        }
    }

    bool collides(const Sprite &a, const Sprite &b) const {
        if (!a.collidable || !b.collidable) {
            return false;
        }
        const double radiusA = std::max(a.atlas.frameW, a.atlas.frameH) * a.scale / 2.0;
        const double radiusB = std::max(b.atlas.frameW, b.atlas.frameH) * b.scale / 2.0;
        return distance(a.pos, b.pos) < radiusA + radiusB;
    }

    void testCollisions() {
        const size_t size = sprites_.size();
        for (size_t i = 0; i < size; ++i) {
            if (!sprites_[i].alive || !sprites_[i].collidable) {
                continue;
            }
            for (size_t j = i + 1; j < size; ++j) {
                if (!sprites_[j].alive || !sprites_[j].collidable || !collides(sprites_[i], sprites_[j])) {
                    continue;
                }
                entityCollision(sprites_[i], sprites_[j]);
                entityCollision(sprites_[j], sprites_[i]);
            }
        }
    }

    void entityCollision(Sprite &entity1, Sprite &entity2) {
        if (entity1.type != ObjectAsteroid) {
            return;
        }
        if (entity2.type == ObjectBullet || entity2.type == ObjectShip) {
            const Vec2 explosionPos{entity1.pos.x - 32.0, entity1.pos.y - 32.0};
            entity1.alive = false;
            entity2.alive = false;

            Sprite explosion;
            explosion.type = ObjectExplosion;
            explosion.atlas = atlas_.at("explosion");
            explosion.pos = explosionPos;
            explosion.currentFrame = 0;
            explosion.frameTimerMs = 40;
            explosion.lifetimeMs = 1000;
            explosion.bornMs = nowMs();
            explosion.collidable = false;
            sprites_.push_back(explosion);

            audio_.play("boom", 0.85f, false);
        }
    }

    void renderSprite(const Sprite &sprite) const {
        SDL_Rect src = sourceRect(sprite);
        SDL_FRect dst{};
        dst.w = static_cast<float>(sprite.atlas.frameW * sprite.scale);
        dst.h = static_cast<float>(sprite.atlas.frameH * sprite.scale);
        dst.x = static_cast<float>(sprite.pos.x - dst.w / 2.0);
        dst.y = static_cast<float>(sprite.pos.y - dst.h / 2.0);
        SDL_RenderCopyExF(renderer_, atlasTexture_, &src, &dst, -sprite.rotation, nullptr, SDL_FLIP_NONE);
    }

    SDL_Rect sourceRect(const Sprite &sprite) const {
        SDL_Rect src{};
        const int frame = std::clamp(sprite.currentFrame, 0, sprite.atlas.totalFrames - 1);
        const int col = frame % sprite.atlas.columns;
        const int row = frame / sprite.atlas.columns;
        src.x = sprite.atlas.frame.x + col * sprite.atlas.frameW;
        src.y = sprite.atlas.frame.y + row * sprite.atlas.frameH;
        src.w = sprite.atlas.frameW;
        src.h = sprite.atlas.frameH;
        return src;
    }

    void renderHud() const {
        SDL_SetRenderDrawBlendMode(renderer_, SDL_BLENDMODE_BLEND);
        SDL_SetRenderDrawColor(renderer_, 15, 19, 28, 165);
        SDL_FRect panel{16.0f, 16.0f, 260.0f, 42.0f};
        SDL_RenderFillRectF(renderer_, &panel);

        SDL_SetRenderDrawColor(renderer_, 120, 210, 255, 230);
        drawBars(30, 29, count(ObjectAsteroid), 28);
        SDL_SetRenderDrawColor(renderer_, 255, 230, 120, 230);
        drawBars(30, 43, count(ObjectBullet), 16);
    }

    void drawBars(int x, int y, int value, int maxBars) const {
        const int bars = std::min(value, maxBars);
        for (int i = 0; i < bars; ++i) {
            SDL_Rect r{x + i * 8, y, 5, 7};
            SDL_RenderFillRect(renderer_, &r);
        }
    }

    SDL_Renderer *renderer_ = nullptr;
    SDL_Texture *atlasTexture_ = nullptr;
    std::filesystem::path resources_;
    std::map<std::string, AtlasSprite> atlas_;
    std::vector<Sprite> sprites_;
    std::mt19937 rng_;
    AudioMixer audio_;
    uint64_t lastAsteroidMs_ = 0;
    uint64_t lastCollisionMs_ = 0;
    double nearestDistance_ = 999999.0;
};

} // namespace

int main(int argc, char **argv) {
    (void)argc;
    (void)argv;

    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_TIMER) != 0) {
        std::fprintf(stderr, "SDL_Init failed: %s\n", SDL_GetError());
        return 1;
    }

    try {
        SDL_Window *window = SDL_CreateWindow("Advanced 2D Asteroid Demo",
                                             SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED,
                                             kScreenWidth, kScreenHeight,
                                             SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE);
        if (!window) {
            throw std::runtime_error(SDL_GetError());
        }

        SDL_Renderer *renderer = SDL_CreateRenderer(window, -1,
                                                    SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC);
        if (!renderer) {
            renderer = SDL_CreateRenderer(window, -1, SDL_RENDERER_SOFTWARE);
        }
        if (!renderer) {
            throw std::runtime_error(SDL_GetError());
        }
        SDL_RenderSetLogicalSize(renderer, kScreenWidth, kScreenHeight);

        const std::filesystem::path resources = executableDir() / "Resources";
        TgaImage atlasImage = loadTga(resources / "GameAtlas.tga");
        SDL_Texture *atlasTexture = createTexture(renderer, atlasImage);

        Game game(renderer, atlasTexture, resources);
        game.loadAudio();

        bool running = true;
        uint64_t lastTick = nowMs();
        while (running) {
            SDL_Event event{};
            while (SDL_PollEvent(&event)) {
                if (event.type == SDL_QUIT) {
                    running = false;
                } else if (event.type == SDL_KEYDOWN && !event.key.repeat) {
                    if (event.key.keysym.sym == SDLK_ESCAPE) {
                        running = false;
                    } else {
                        game.handleKey(event.key.keysym.sym);
                    }
                }
            }

            game.update();
            game.render();

            const uint64_t current = nowMs();
            const uint64_t elapsed = current - lastTick;
            if (elapsed < 16) {
                SDL_Delay(static_cast<uint32_t>(16 - elapsed));
            }
            lastTick = current;
        }

        SDL_DestroyTexture(atlasTexture);
        SDL_DestroyRenderer(renderer);
        SDL_DestroyWindow(window);
        SDL_Quit();
        return 0;
    } catch (const std::exception &ex) {
        std::fprintf(stderr, "Fatal error: %s\n", ex.what());
        SDL_Quit();
        return 1;
    }
}
