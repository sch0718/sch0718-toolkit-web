# Changesets

패키지를 바꾸는 PR에는 `pnpm changeset`으로 변경 기록 파일을 하나 추가합니다. 어떤 패키지를 patch·minor·major로 올릴지와 변경 내용을 적습니다. `0.x` 동안은 minor를 깨지는 변경으로 봅니다.

main에 병합되면 릴리스 워크플로가 "Version Packages" PR을 엽니다. 그 PR을 병합하면 GitHub Packages에 발행됩니다(저장소 README의 「릴리스」 참고).
