export declare function packageEnginesFromDirectory(workspaceDirectory: string): Promise<{
    node?: string;
    npm?: string;
    pnpm?: string;
}[]>;
export declare const packageEnginesMaximumVersions: (...engines: Array<Record<string, string | undefined> | undefined>) => {
    [x: string]: string;
};
//# sourceMappingURL=versions.d.ts.map