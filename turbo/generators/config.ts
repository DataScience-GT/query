import {execSync} from "node:child_process";
import type {PlopTypes} from "@turbo/gen";


interface PackageJson {
    name: string;
    script: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}


export default function generator(plop: PlopTypes.NodePlopAPI): void {
    plop.setGenerator("init", {
        description: "Generate a new package"
        prompts: [
            {
                type: "input",
                name: "name",
                message:
                "name of package",
            },
            {
                type: "input",
                name: "deps",
                message:
                "what would u want to install",

            },
        ],
        actions: [
            (answers) => {
                if ("name" in answers && typeof answers.name == "string") {
                    if (answers.name.startsWith("@cerebra/")) {
                        answers.name = answers.name.replace("@cerebra/", "")
                    }
            }
        return "created";
    },
    {
        type: "add",
        path: "packages/{{ name }}/eslint.config.js",
        templateFile

    }
        ]
    });

}