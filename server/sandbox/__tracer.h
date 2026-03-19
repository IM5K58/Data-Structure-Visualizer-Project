#ifndef __VIERASION_TRACER_H__
#define __VIERASION_TRACER_H__

#include <iostream>
#include <sstream>
#include <string>
#include <cstdint>

namespace __vt {
    static int step = 0;

    inline void alloc(int line, const char* var, const void* addr, const char* type, const char* hint = nullptr) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"ALLOC\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"addr\":\"" << reinterpret_cast<uintptr_t>(addr) << "\""
                  << ",\"struct\":\"" << type << "\"";
        if (hint) {
            std::cout << ",\"hint\":\"" << hint << "\"";
        }
        std::cout << "}" << std::endl;
    }

    inline void dealloc(int line, const char* var, const void* addr) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"DELETE\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"addr\":\"" << reinterpret_cast<uintptr_t>(addr) << "\""
                  << "}" << std::endl;
    }

    inline void set_field_int(int line, const char* var, const char* field, const void* source, int value) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"SET_FIELD\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"field\":\"" << field << "\""
                  << ",\"source\":\"" << reinterpret_cast<uintptr_t>(source) << "\""
                  << ",\"value\":" << value
                  << "}" << std::endl;
    }

    inline void set_field_double(int line, const char* var, const char* field, const void* source, double value) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"SET_FIELD\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"field\":\"" << field << "\""
                  << ",\"source\":\"" << reinterpret_cast<uintptr_t>(source) << "\""
                  << ",\"value\":" << value
                  << "}" << std::endl;
    }

    inline void set_field_str(int line, const char* var, const char* field, const void* source, const std::string& value) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"SET_FIELD\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"field\":\"" << field << "\""
                  << ",\"source\":\"" << reinterpret_cast<uintptr_t>(source) << "\""
                  << ",\"value\":\"" << value << "\""
                  << "}" << std::endl;
    }

    inline void set_field_string(int line, const char* var, const char* field, const void* source, const std::string& value) {
        set_field_str(line, var, field, source, value);
    }

    inline void set_ptr(int line, const char* var, const char* field, const void* source, const void* target) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"SET_PTR\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"field\":\"" << field << "\""
                  << ",\"source\":\"" << reinterpret_cast<uintptr_t>(source) << "\""
                  << ",\"target\":\"" << reinterpret_cast<uintptr_t>(target) << "\""
                  << "}" << std::endl;
    }

    inline void push(int line, const char* var, const char* val) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"PUSH\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"value\":\"" << val << "\""
                  << "}" << std::endl;
    }

    // Type-specific overloads (선호됨 — 템플릿보다 우선)
    inline void push_val(int line, const char* var, int val) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"PUSH\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"value\":\"" << val << "\""
                  << "}" << std::endl;
    }

    inline void push_val(int line, const char* var, double val) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"PUSH\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"value\":\"" << val << "\""
                  << "}" << std::endl;
    }

    inline void push_val(int line, const char* var, const std::string& val) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"PUSH\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"value\":\"" << val << "\""
                  << "}" << std::endl;
    }

    inline void push_val(int line, const char* var, const char* val) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"PUSH\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"value\":\"" << val << "\""
                  << "}" << std::endl;
    }

    // Fallback 템플릿 (operator<< 있는 타입용)
    template<typename T>
    inline void push_val(int line, const char* var, T val) {
        std::ostringstream oss;
        oss << val;
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"PUSH\""
                  << ",\"var\":\"" << var << "\""
                  << ",\"value\":\"" << oss.str() << "\""
                  << "}" << std::endl;
    }

    inline void pop(int line, const char* var) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"POP\""
                  << ",\"var\":\"" << var << "\""
                  << "}" << std::endl;
    }

    inline void set_line(int line, const char* raw) {
        std::cout << "__TRACE__{"
                  << "\"step\":" << ++step
                  << ",\"line\":" << line
                  << ",\"type\":\"LINE\""
                  << ",\"raw\":\"" << raw << "\""
                  << "}" << std::endl;
    }
}

#endif
