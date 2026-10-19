# ITSUKI JUDGE 🚀

**ITSUKI JUDGE** là tiện ích mở rộng (VS Code & VSCodium Extension) dành riêng cho cộng đồng Lập trình Thi đấu (Competitive Programming - CP). Extension cung cấp môi trường chấm bài trực tiếp (Local/Online Judge) ngay trên thanh Sidebar .Lam Son Copyright .Với giao diện hiện đại, kế thừa phong cách tối giản của "CP Judge", tích hợp chặt chẽ với VSCodium và VS Code trên Linux, macOS và Windows.

---

## ✨ Tính Năng Nổi Bật

1. **Quản lý & Chấm bài Trực Tiếp trong Sidebar**:
   - Tự động nhận diện file đang active trên editor: C++ (`.cpp`), Python (`.py`), Java (`.java`), C (`.c`).
   - Tự động nạp cấu hình và bộ test tương ứng của bài toán.
2. **Tùy chỉnh Giới hạn Thời gian (TL) & Bộ nhớ (ML)**:
   - Ô nhập trực quan: `TL` (ms) và `ML` (MB) ngay trên thanh cấu hình.
   - Giám sát độ chính xác cao bằng `process.hrtime.bigint()` và tự động `kill()` tiến trình khi vượt ngưỡng TL/ML.
3. **Đầy đủ Bộ Trạng Thái Chấm Chuẩn Quốc Tế**:
   - **AC (Accepted)**: Kết quả khớp hoàn toàn (bỏ qua khoảng trắng cuối dòng và dòng trống cuối file).
   - **WA (Wrong Answer)**: Hiển thị bảng so sánh Diff chi tiết (Expected vs Actual, đánh dấu dòng sai).
   - **TLE (Time Limit Exceeded)**: Hết thời gian thực thi cho phép.
   - **MLE (Memory Limit Exceeded)**: Tiêu tốn bộ nhớ vượt ngưỡng cấu hình.
   - **RTE (Runtime Error)**: Crash, lỗi bộ nhớ, segfault, division by zero, hoặc ngoại lệ unhandled.
   - **CE (Compilation Error)**: Lỗi biên dịch kèm log chi tiết từ g++ / javac / py_compile.
4. **[NÂNG CẤP 1] Batch Import Tests Thông Minh**:
   - Nhấn nút **Import Folder** để chọn một thư mục bất kỳ.
   - Hỗ trợ cả 2 định dạng:
     - **Case A (Subfolders)**: Các folder con `Test01`, `Test02`, `1`, `2`... mỗi folder chứa file `*.inp` (hoặc `.in`, `.txt`) và `*.out` (hoặc `.ans`, `.txt`).
     - **Case B (Flat folder)**: Thư mục phẳng chứa các cặp file cùng tên như `test1.inp` & `test1.out`, `caykhe.INP` & `caykhe.OUT`, `input01.txt` & `output01.txt`.
     - Sắp xếp tự nhiên (Natural Sort: `Test1`, `Test2`, `Test10`).
5. **[NÂNG CẤP 2] Add N Tests Hàng Loạt & Phím Tắt Tiện Lợi**:
   - Nhấn nút **+ N Tests** trên thanh công cụ hoặc Command Palette.
   - Nhập số lượng $N$ ($1 \le N \le 100$) trong modal với phím tắt `Enter` để tạo ngay, `Esc` hoặc bấm ra ngoài để đóng.
6. **Bố Cục Thanh Công Cụ 2 Hàng Trực Quan (Two-Row Layout)**:
   - **Hàng 1 (Thao tác chính)**: `+ Add Test` & `Run All` (phím tắt `Ctrl+Alt+R` / `Cmd+Alt+R`).
   - **Hàng 2 (Tiện ích & Batch)**: `+ N Tests` & `Import Folder`.
   - Nút phím tắt nhanh: `Ctrl+Alt+A` để thêm test case mới tức thì từ trình soạn thảo.
7. **Bảo Mật Lưu Trữ & Tránh Xung Đột Thư Mục (Collision-Free Storage)**:
   - Lưu trữ tự động tại `.itsuki/<relative_path>.json` phản ánh chính xác cấu trúc thư mục dự án (ví dụ `contest1/sol.cpp` và `contest2/sol.cpp` lưu biệt lập).
   - Tự động tương thích ngược với các file cấu hình cũ dạng `.itsuki/<basename>.json`.
8. **Đo Bộ Nhớ Chuẩn Xác với VmHWM & Chống Lỗi Stdin EPIPE**:
   - Theo dõi bộ nhớ vật lý đỉnh (Peak Physical RSS) qua `VmHWM` trên Linux và `getrusage`, loại bỏ đo ảo của VmPeak.
   - Bắt và xử lý an toàn lỗi luồng `EPIPE` khi bài giải thoát sớm mà không đọc hết dữ liệu đầu vào.

---

## 🛠 Hướng Dẫn Cài Đặt & Đóng Gói .VSIX

### 1. Cài đặt Dependencies
```bash
npm install
```

### 2. Biên dịch TypeScript
```bash
npm run compile
```

### 3. Chạy Toàn Bộ Test Suite
```bash
npm run build:test
npm test
```

### 4. Đóng gói thành file `.vsix`
```bash
npm run package
```
Lệnh trên sẽ tạo ra file `itsuki-judge-1.0.0.vsix` tại thư mục gốc của dự án.

### 5. Cài đặt vào VSCodium / VS Code
- **Cách 1: Qua dòng lệnh**:
  ```bash
  codium --install-extension itsuki-judge-1.0.0.vsix
  # hoặc trên VS Code:
  code --install-extension itsuki-judge-1.0.0.vsix
  ```
- **Cách 2: Qua giao diện**:
  1. Mở VSCodium / VS Code.
  2. Bấm tổ hợp phím `Ctrl+Shift+X` (hoặc `Cmd+Shift+X` trên macOS) để mở bảng Extensions.
  3. Bấm vào biểu tượng `...` (Views and More Actions) ở góc trên bên phải bảng Extensions.
  4. Chọn **Install from VSIX...** và trỏ đến file `itsuki-judge-1.0.0.vsix`.

---

## 🚀 Kịch Bản Kiểm Thử Tính Năng Import Folder

Dự án đã tích hợp sẵn thư mục mẫu `samples/` để người dùng trải nghiệm ngay:

1. **Mở file code mẫu**:
   - Mở file `samples/caykhe.cpp` trong VS Code.
   - Bấm vào icon **ITSUKI JUDGE** trên thanh Activity Bar bên trái.
   - Sidebar sẽ lập tức nhận diện `caykhe.cpp` với nhãn ngôn ngữ `C++`.

2. **Thử nghiệm Batch Import - Case A (Thư mục con `Test01`, `Test02`, `Test03`)**:
   - Bấm nút **Import** trên thanh công cụ Sidebar.
   - Chọn thư mục: `samples/tests_case_a_subfolders`.
   - Hệ thống tự động nạp 3 test cases `Test #1`, `Test #2`, `Test #3`.

3. **Thử nghiệm Chấm bài (Run All)**:
   - Bấm nút **Run All**.
   - Extension sẽ tự động biên dịch bằng `g++ -O3 -std=c++17`, thực thi từng test và hiển thị trạng thái `AC` màu xanh lục kèm thời gian chạy tính bằng `ms`.

4. **Thử nghiệm Batch Import - Case B (Thư mục phẳng `caykhe_*.inp/out`)**:
   - Bấm nút **Clear All**.
   - Bấm nút **Import** và chọn thư mục `samples/tests_case_b_flat`.
   - Cả 3 test cases dạng phẳng được nhận diện và nạp thành công.

5. **Thử nghiệm tính năng Add N Tests**:
   - Bấm nút **+ N Tests**.
   - Nhập số lượng `5` và nhấn **Tạo ngay**.
   - 5 thẻ test mới rỗng được thêm liên tiếp vào danh sách.

---

## ⚙ Cấu Hình Tùy Biến (Settings)

Extension cung cấp các cài đặt trong `settings.json`:

| Cài đặt | Kiểu | Mặc định | Mô tả |
| :--- | :--- | :--- | :--- |
| `itsukiJudge.defaultTimeLimit` | `number` | `1000` | Giới hạn thời gian mặc định (ms) |
| `itsukiJudge.defaultMemoryLimit` | `number` | `256` | Giới hạn bộ nhớ mặc định (MB) |
| `itsukiJudge.cppCompiler` | `string` | `"g++"` | Trình biên dịch C++ |
| `itsukiJudge.cppFlags` | `string[]` | `["-O3", "-std=c++17"]` | Cờ tối ưu C++ |
| `itsukiJudge.pythonCommand` | `string` | `"python3"` | Trình thông dịch Python |
| `itsukiJudge.javaCompiler` | `string` | `"javac"` | Trình biên dịch Java |
| `itsukiJudge.javaCommand` | `string` | `"java"` | Trình thực thi Java |

---

## 📄 Bản Quyền & Giấy Phép
Phát triển bởi **Haruto Itsuki** - Giấy phép MIT.
